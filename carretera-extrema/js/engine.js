/**
 * Motor principal del juego (lógica + render).
 *
 * Extensión:
 *  - Mapas / constantes → js/config.js
 *  - Persecución estado → js/systems/chaseState.js
 *  - Controles         → js/input.js
 *  - DOM               → js/dom.js
 */
import { MAPS, POWER, WEATHER_CYCLE } from './config.js';
import { playerImg, policeImg, policeVanImg, photoBus, photoTaxi, powerToretto } from '../assets/sprites.js';
import { chase, resetChaseState, toggleGodMode as _toggleGodMode } from './systems/chaseState.js';
const esmatImg = new Image();
esmatImg.src = 'assets/esmat.png';


import {
  canvas as c, ctx, overlay, wrapEl,
  scoreEl, bestEl, pauseBtn, pauseOverlay
} from './dom.js';

/* ===== Layout / orientación ===== */
function isDesktop(){
  const w = window.innerWidth, h = window.innerHeight;
  const wide = w >= 700 && w > h;
  const noTouch = !('ontouchstart' in window) && !(navigator.maxTouchPoints > 0);
  return wide || (noTouch && w >= 600);
}
let LANDSCAPE = isDesktop();
let W = LANDSCAPE ? 900 : 420;
let H = LANDSCAPE ? 520 : 700;
let ROAD_LEFT, ROAD_RIGHT, ROAD_INNER_L, ROAD_INNER_R, PLAYER_Y, lanes;

function layout(){
  LANDSCAPE = isDesktop();
  W = LANDSCAPE ? 900 : 420;
  H = LANDSCAPE ? 520 : 700;
  c.width = W; c.height = H;
  if (LANDSCAPE) wrapEl.classList.add('landscape');
  else wrapEl.classList.remove('landscape');
  ROAD_LEFT = Math.floor(W * 0.20);
  ROAD_RIGHT = Math.floor(W * 0.80);
  ROAD_INNER_L = ROAD_LEFT + 10;
  ROAD_INNER_R = ROAD_RIGHT - 10;
  const roadW = ROAD_RIGHT - ROAD_LEFT;
  lanes = [
    ROAD_LEFT + roadW * 0.20,
    ROAD_LEFT + roadW * 0.50,
    ROAD_LEFT + roadW * 0.80
  ];
  PLAYER_Y = H - (LANDSCAPE ? 72 : 85);
  try {
    if (typeof playerX === 'number') {
      const li = (typeof lane === 'number') ? lane : 1;
      playerX = lanes[li];
      playerTargetX = playerX;
    }
  } catch (e) {}
}

function setPauseUI(on){
  if (on) {
    pauseOverlay.classList.add('show');
    pauseBtn.textContent = '▶';
    pauseBtn.title = 'Reanudar (P)';
  } else {
    pauseOverlay.classList.remove('show');
    pauseBtn.textContent = '⏸';
    pauseBtn.title = 'Pausa (P)';
  }
  pauseBtn.disabled = !running || crashAnim || over;
}

function togglePause(){
  if (!running || crashAnim || over) return;
  paused = !paused;
  setPauseUI(paused);
  if (paused) {
    try { stopEngine(); } catch (e) {}
    try { stopMusic(); } catch (e) {}
    try { stopSiren(); } catch (e) {}
  } else {
    last = performance.now();
    try { startEngine(); updateEngine(speed); } catch (e) {}
    try { startMusic(); } catch (e) {}
    if (gameMode === 'chase' && chaseIntroDone) try { startSiren(); } catch (e) {}
    requestAnimationFrame(frame);
  }
}


let selectedMap = localStorage.getItem('carreteraMap') || 'costa';
if (!MAPS[selectedMap]) selectedMap = 'costa';
function getMap(){ return MAPS[selectedMap] || MAPS.costa; }
function setSelectedMap(id){
  if (!MAPS[id]) return;
  selectedMap = id;
  localStorage.setItem('carreteraMap', id);
}

let running=false,over=false,paused=false,score=0,bestClassic=Number(localStorage.getItem('carreteraBest')||0),bestChase=Number(localStorage.getItem('carreteraBestChase')||0),best=bestClassic,last=0,spawn=0,speed=260,roadOffset=0,ambientScroll=0,traffic=[],particles=[];
let lane=1,playerX=0,playerTargetX=0,shake=0,crashAnim=false,crashT=0,crashOther=null;
let powerUps=[], powerTimer=0, powerActive=false, powerType=null, powerSpawn=0;
let gunBullets=[], gunFireTimer=0; // balas de la habilidad "armas"
layout(); // inicializa lanes, W, H, PLAYER_Y
playerX = lanes[1];
playerTargetX = playerX;

/* ===== Sprites fotográficos (bus rojo + taxi amarillo) ===== */
/* ===== Sprites procedurales mejorados ===== */
const vehicleSprites={};
function makeSprite(drawFn,w,h){
  const off=document.createElement('canvas');
  off.width=w; off.height=h;
  const octx=off.getContext('2d');
  drawFn(octx,w,h);
  const img=new Image();
  img.src=off.toDataURL('image/png');
  return img;
}

function paintCar(octx,W,H,bodyColor,style){
  // Sombra
  octx.fillStyle='rgba(0,0,0,0.45)';
  octx.beginPath();
  octx.ellipse(W/2, H*0.94, W*0.38, H*0.05, 0, 0, Math.PI*2);
  octx.fill();

  const darken = (hex, amt)=>{
    const n=parseInt(hex.slice(1),16);
    let r=(n>>16)-amt, g=((n>>8)&255)-amt, b=(n&255)-amt;
    r=Math.max(0,r); g=Math.max(0,g); b=Math.max(0,b);
    return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
  };
  const lighten = (hex, amt)=>{
    const n=parseInt(hex.slice(1),16);
    let r=Math.min(255,(n>>16)+amt), g=Math.min(255,((n>>8)&255)+amt), b=Math.min(255,(n&255)+amt);
    return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
  };

  const wheel = (x,y,rw,rh)=>{
    // neumático
    octx.fillStyle='#0a0c10';
    octx.beginPath(); octx.roundRect(x,y,rw,rh,rw*0.25); octx.fill();
    // llanta
    octx.fillStyle='#4a5060';
    octx.beginPath(); octx.arc(x+rw/2, y+rh/2, rw*0.28, 0, Math.PI*2); octx.fill();
    octx.fillStyle='#1e222a';
    octx.beginPath(); octx.arc(x+rw/2, y+rh/2, rw*0.12, 0, Math.PI*2); octx.fill();
  };

  if(style==='bus'){
    // === BUS vista superior ===
    const bodyL=W*0.12, bodyT=H*0.04, bodyW=W*0.76, bodyH=H*0.90;
    // carrocería
    let g=octx.createLinearGradient(bodyL,0,bodyL+bodyW,0);
    g.addColorStop(0, darken(bodyColor,40));
    g.addColorStop(0.15, bodyColor);
    g.addColorStop(0.5, lighten(bodyColor,15));
    g.addColorStop(0.85, bodyColor);
    g.addColorStop(1, darken(bodyColor,40));
    octx.fillStyle=g;
    octx.beginPath(); octx.roundRect(bodyL, bodyT, bodyW, bodyH, 10); octx.fill();
    // borde
    octx.strokeStyle='rgba(0,0,0,0.35)'; octx.lineWidth=1.5; octx.stroke();
    // techo / AC unit
    octx.fillStyle=darken(bodyColor,25);
    octx.beginPath(); octx.roundRect(W*0.28, H*0.38, W*0.44, H*0.22, 4); octx.fill();
    octx.fillStyle='#2a3038';
    octx.beginPath(); octx.roundRect(W*0.36, H*0.44, W*0.28, H*0.12, 3); octx.fill();
    // ventiladores
    octx.fillStyle='#1a1e24';
    octx.beginPath(); octx.arc(W*0.44, H*0.50, 5, 0, Math.PI*2); octx.fill();
    octx.beginPath(); octx.arc(W*0.56, H*0.50, 5, 0, Math.PI*2); octx.fill();
    // parabrisas delantero (arriba = frente en top-down traffic coming down? 
    // In our game traffic faces down toward player, so front of traffic car is at bottom of sprite
    // Wait - looking at photo bus: front is at TOP of image (windshield at top)
    // Player faces up the road, traffic comes from top going down - so traffic front should face player = bottom of screen
    // Photo vehicles: taxi has front (headlights) at TOP of image. When drawn, they approach player head-first visually if front is top...
    // Actually in the original game drawCar, headlights were at -h (top) which is front facing up/away.
    // Looking at original: traffic cars have headlights at top (-h*.47) and taillights at bottom.
    // So front of car is TOP of sprite. Good - matches the photos.
    // parabrisas frontal (arriba)
    octx.fillStyle='#0a2035';
    octx.beginPath(); octx.roundRect(W*0.22, H*0.05, W*0.56, H*0.14, 5); octx.fill();
    octx.fillStyle='rgba(160,210,255,0.25)';
    octx.fillRect(W*0.24, H*0.06, W*0.2, H*0.05);
    // ventanas laterales (dentro de la carrocería, alineadas)
    octx.fillStyle='#0a1c2e';
    for(let i=0;i<5;i++){
      const wy = H*0.22 + i*H*0.12;
      octx.beginPath(); octx.roundRect(W*0.155, wy, W*0.07, H*0.08, 2); octx.fill();
      octx.beginPath(); octx.roundRect(W*0.775, wy, W*0.07, H*0.08, 2); octx.fill();
    }
    // sutil reflejo en ventanas
    octx.fillStyle='rgba(140,190,230,0.18)';
    for(let i=0;i<5;i++){
      const wy = H*0.22 + i*H*0.12;
      octx.fillRect(W*0.16, wy+1, W*0.025, H*0.05);
      octx.fillRect(W*0.78, wy+1, W*0.025, H*0.05);
    }
    // luneta trasera
    octx.fillStyle='#0a2035';
    octx.beginPath(); octx.roundRect(W*0.25, H*0.84, W*0.5, H*0.08, 3); octx.fill();
    // número techo
    octx.fillStyle='rgba(0,0,0,0.5)';
    octx.font = 'bold ' + Math.floor(H*0.08) + 'px sans-serif';
    octx.textAlign='center';
    octx.fillText('783', W/2, H*0.34);
    // ruedas (bajo el cuerpo)
    wheel(W*0.13, H*0.22, W*0.12, H*0.09);
    wheel(W*0.75, H*0.22, W*0.12, H*0.09);
    wheel(W*0.13, H*0.72, W*0.12, H*0.09);
    wheel(W*0.75, H*0.72, W*0.12, H*0.09);
    // luces delanteras
    octx.fillStyle='#fff0b0';
    octx.beginPath(); octx.roundRect(W*0.22, H*0.02, W*0.14, 4, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.64, H*0.02, W*0.14, 4, 2); octx.fill();
    // luces traseras
    octx.fillStyle='#ff2a2a';
    octx.beginPath(); octx.roundRect(W*0.24, H*0.93, W*0.12, 4, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.64, H*0.93, W*0.12, 4, 2); octx.fill();

  } else if(style==='truck'){
    // === CAMIÓN vista superior ===
    // cabina (arriba)
    let g=octx.createLinearGradient(W*0.15,0,W*0.85,0);
    g.addColorStop(0, darken(bodyColor,35));
    g.addColorStop(0.2, bodyColor);
    g.addColorStop(0.5, lighten(bodyColor,20));
    g.addColorStop(0.8, bodyColor);
    g.addColorStop(1, darken(bodyColor,35));
    octx.fillStyle=g;
    octx.beginPath(); octx.roundRect(W*0.18, H*0.04, W*0.64, H*0.28, 8); octx.fill();
    // parabrisas
    octx.fillStyle='#0a2035';
    octx.beginPath(); octx.roundRect(W*0.24, H*0.06, W*0.52, H*0.14, 4); octx.fill();
    octx.fillStyle='rgba(160,210,255,0.28)';
    octx.fillRect(W*0.26, H*0.07, W*0.18, H*0.05);
    // caja de carga
    octx.fillStyle='#3a4554';
    octx.beginPath(); octx.roundRect(W*0.14, H*0.34, W*0.72, H*0.56, 5); octx.fill();
    octx.fillStyle='#2a3342';
    // paneles de la caja
    for(let i=0;i<3;i++){
      octx.fillRect(W*0.18, H*0.40+i*H*0.14, W*0.64, H*0.02);
    }
    // ruedas
    wheel(W*0.14, H*0.16, W*0.13, H*0.10);
    wheel(W*0.73, H*0.16, W*0.13, H*0.10);
    wheel(W*0.14, H*0.70, W*0.13, H*0.11);
    wheel(W*0.73, H*0.70, W*0.13, H*0.11);
    // luces
    octx.fillStyle='#fff0b0';
    octx.beginPath(); octx.roundRect(W*0.26, H*0.02, W*0.12, 4, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.62, H*0.02, W*0.12, 4, 2); octx.fill();
    octx.fillStyle='#ff2a2a';
    octx.beginPath(); octx.roundRect(W*0.28, H*0.90, W*0.11, 4, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.61, H*0.90, W*0.11, 4, 2); octx.fill();

  } else if(style==='van'){
    // === FURGONETA vista superior ===
    let g=octx.createLinearGradient(W*0.12,0,W*0.88,0);
    g.addColorStop(0, darken(bodyColor,35));
    g.addColorStop(0.18, bodyColor);
    g.addColorStop(0.5, lighten(bodyColor,18));
    g.addColorStop(0.82, bodyColor);
    g.addColorStop(1, darken(bodyColor,35));
    octx.fillStyle=g;
    octx.beginPath(); octx.roundRect(W*0.14, H*0.05, W*0.72, H*0.88, 9); octx.fill();
    octx.strokeStyle='rgba(0,0,0,0.3)'; octx.lineWidth=1.5; octx.stroke();
    // parabrisas
    octx.fillStyle='#0a2035';
    octx.beginPath(); octx.roundRect(W*0.22, H*0.08, W*0.56, H*0.16, 5); octx.fill();
    octx.fillStyle='rgba(160,210,255,0.28)';
    octx.fillRect(W*0.24, H*0.09, W*0.2, H*0.06);
    // techo plano
    octx.fillStyle=darken(bodyColor,20);
    octx.beginPath(); octx.roundRect(W*0.22, H*0.28, W*0.56, H*0.42, 3); octx.fill();
    // ventanas laterales de la cabina (solo zona delantera)
    octx.fillStyle='#0a1c2e';
    octx.beginPath(); octx.roundRect(W*0.155, H*0.12, W*0.065, H*0.12, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.78, H*0.12, W*0.065, H*0.12, 2); octx.fill();
    octx.fillStyle='rgba(140,190,230,0.2)';
    octx.fillRect(W*0.16, H*0.13, W*0.025, H*0.07);
    octx.fillRect(W*0.785, H*0.13, W*0.025, H*0.07);
    // luneta
    octx.fillStyle='#0a2035';
    octx.beginPath(); octx.roundRect(W*0.24, H*0.78, W*0.52, H*0.1, 4); octx.fill();
    // ruedas
    wheel(W*0.14, H*0.24, W*0.12, H*0.10);
    wheel(W*0.74, H*0.24, W*0.12, H*0.10);
    wheel(W*0.14, H*0.68, W*0.12, H*0.10);
    wheel(W*0.74, H*0.68, W*0.12, H*0.10);
    // luces
    octx.fillStyle='#fff0b0';
    octx.beginPath(); octx.roundRect(W*0.26, H*0.03, W*0.12, 4, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.62, H*0.03, W*0.12, 4, 2); octx.fill();
    octx.fillStyle='#ff2a2a';
    octx.beginPath(); octx.roundRect(W*0.28, H*0.92, W*0.11, 4, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.61, H*0.92, W*0.11, 4, 2); octx.fill();

  } else if(style==='sport'){
    // === DEPORTIVO vista superior – bajo y ancho ===
    let g=octx.createLinearGradient(W*0.08,0,W*0.92,0);
    g.addColorStop(0, darken(bodyColor,40));
    g.addColorStop(0.2, bodyColor);
    g.addColorStop(0.5, lighten(bodyColor,25));
    g.addColorStop(0.8, bodyColor);
    g.addColorStop(1, darken(bodyColor,40));
    octx.fillStyle=g;
    // silueta aerodinámica
    octx.beginPath();
    octx.moveTo(W*0.18, H*0.12);
    octx.quadraticCurveTo(W*0.12, H*0.20, W*0.10, H*0.40);
    octx.lineTo(W*0.10, H*0.62);
    octx.quadraticCurveTo(W*0.12, H*0.80, W*0.22, H*0.88);
    octx.lineTo(W*0.78, H*0.88);
    octx.quadraticCurveTo(W*0.88, H*0.80, W*0.90, H*0.62);
    octx.lineTo(W*0.90, H*0.40);
    octx.quadraticCurveTo(W*0.88, H*0.20, W*0.82, H*0.12);
    octx.closePath();
    octx.fill();
    octx.strokeStyle='rgba(0,0,0,0.35)'; octx.lineWidth=1.5; octx.stroke();
    // parabrisas
    octx.fillStyle='#061828';
    octx.beginPath();
    octx.moveTo(W*0.28, H*0.22);
    octx.lineTo(W*0.72, H*0.22);
    octx.lineTo(W*0.68, H*0.42);
    octx.lineTo(W*0.32, H*0.42);
    octx.closePath(); octx.fill();
    octx.fillStyle='rgba(160,210,255,0.3)';
    octx.beginPath();
    octx.moveTo(W*0.30, H*0.24);
    octx.lineTo(W*0.48, H*0.24);
    octx.lineTo(W*0.45, H*0.40);
    octx.lineTo(W*0.32, H*0.40);
    octx.closePath(); octx.fill();
    // techo bajo
    octx.fillStyle=darken(bodyColor,15);
    octx.beginPath(); octx.roundRect(W*0.30, H*0.44, W*0.40, H*0.18, 3); octx.fill();
    // ventanas laterales delgadas
    octx.fillStyle='#061828';
    octx.beginPath(); octx.roundRect(W*0.12, H*0.36, W*0.08, H*0.18, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.80, H*0.36, W*0.08, H*0.18, 2); octx.fill();
    octx.fillStyle='rgba(140,190,230,0.2)';
    octx.fillRect(W*0.13, H*0.38, W*0.03, H*0.1);
    octx.fillRect(W*0.81, H*0.38, W*0.03, H*0.1);
    // alerón trasero
    octx.fillStyle=darken(bodyColor,30);
    octx.beginPath(); octx.roundRect(W*0.26, H*0.82, W*0.48, H*0.06, 2); octx.fill();
    // ruedas (anchas, deportivas)
    wheel(W*0.12, H*0.28, W*0.13, H*0.11);
    wheel(W*0.75, H*0.28, W*0.13, H*0.11);
    wheel(W*0.12, H*0.62, W*0.13, H*0.11);
    wheel(W*0.75, H*0.62, W*0.13, H*0.11);
    // faros
    octx.fillStyle='#fff0b0';
    octx.beginPath(); octx.roundRect(W*0.28, H*0.08, W*0.12, 4, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.60, H*0.08, W*0.12, 4, 2); octx.fill();
    octx.fillStyle='#ff2a2a';
    octx.beginPath(); octx.roundRect(W*0.30, H*0.90, W*0.10, 4, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.60, H*0.90, W*0.10, 4, 2); octx.fill();

  } else {
    // === COCHE / SEDÁN vista superior (estilo taxi real) ===
    let g=octx.createLinearGradient(W*0.10,0,W*0.90,0);
    g.addColorStop(0, darken(bodyColor,40));
    g.addColorStop(0.18, bodyColor);
    g.addColorStop(0.5, lighten(bodyColor,22));
    g.addColorStop(0.82, bodyColor);
    g.addColorStop(1, darken(bodyColor,40));
    octx.fillStyle=g;
    // carrocería con forma de coche real
    octx.beginPath();
    // frente redondeado (arriba)
    octx.moveTo(W*0.22, H*0.08);
    octx.quadraticCurveTo(W*0.14, H*0.10, W*0.12, H*0.22);
    octx.lineTo(W*0.12, H*0.75);
    octx.quadraticCurveTo(W*0.14, H*0.88, W*0.25, H*0.92);
    octx.lineTo(W*0.75, H*0.92);
    octx.quadraticCurveTo(W*0.86, H*0.88, W*0.88, H*0.75);
    octx.lineTo(W*0.88, H*0.22);
    octx.quadraticCurveTo(W*0.86, H*0.10, W*0.78, H*0.08);
    octx.closePath();
    octx.fill();
    octx.strokeStyle='rgba(0,0,0,0.3)'; octx.lineWidth=1.5; octx.stroke();
    // capó con líneas
    octx.strokeStyle='rgba(255,255,255,0.12)'; octx.lineWidth=1;
    octx.beginPath(); octx.moveTo(W*0.35, H*0.12); octx.lineTo(W*0.35, H*0.26); octx.stroke();
    octx.beginPath(); octx.moveTo(W*0.65, H*0.12); octx.lineTo(W*0.65, H*0.26); octx.stroke();
    // parabrisas
    octx.fillStyle='#061828';
    octx.beginPath();
    octx.moveTo(W*0.26, H*0.28);
    octx.lineTo(W*0.74, H*0.28);
    octx.lineTo(W*0.70, H*0.46);
    octx.lineTo(W*0.30, H*0.46);
    octx.closePath(); octx.fill();
    // reflejo cristal
    octx.fillStyle='rgba(160,210,255,0.30)';
    octx.beginPath();
    octx.moveTo(W*0.28, H*0.30);
    octx.lineTo(W*0.48, H*0.30);
    octx.lineTo(W*0.45, H*0.44);
    octx.lineTo(W*0.30, H*0.44);
    octx.closePath(); octx.fill();
    // techo
    octx.fillStyle=darken(bodyColor,12);
    octx.beginPath(); octx.roundRect(W*0.28, H*0.48, W*0.44, H*0.20, 3); octx.fill();
    // ventanas laterales (delantera y trasera, integradas al habitáculo)
    octx.fillStyle='#0a1c2e';
    // lado izquierdo
    octx.beginPath(); octx.roundRect(W*0.135, H*0.34, W*0.07, H*0.12, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.135, H*0.50, W*0.07, H*0.14, 2); octx.fill();
    // lado derecho
    octx.beginPath(); octx.roundRect(W*0.795, H*0.34, W*0.07, H*0.12, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.795, H*0.50, W*0.07, H*0.14, 2); octx.fill();
    octx.fillStyle='rgba(140,190,230,0.22)';
    octx.fillRect(W*0.14, H*0.35, W*0.025, H*0.07);
    octx.fillRect(W*0.14, H*0.52, W*0.025, H*0.08);
    octx.fillRect(W*0.80, H*0.35, W*0.025, H*0.07);
    octx.fillRect(W*0.80, H*0.52, W*0.025, H*0.08);
    // luneta trasera
    octx.fillStyle='#061828';
    octx.beginPath();
    octx.moveTo(W*0.30, H*0.70);
    octx.lineTo(W*0.70, H*0.70);
    octx.lineTo(W*0.74, H*0.84);
    octx.lineTo(W*0.26, H*0.84);
    octx.closePath(); octx.fill();
    octx.fillStyle='rgba(160,210,255,0.18)';
    octx.fillRect(W*0.32, H*0.72, W*0.15, H*0.06);
    // ruedas bien debajo del cuerpo
    wheel(W*0.13, H*0.26, W*0.12, H*0.11);
    wheel(W*0.75, H*0.26, W*0.12, H*0.11);
    wheel(W*0.13, H*0.66, W*0.12, H*0.11);
    wheel(W*0.75, H*0.66, W*0.12, H*0.11);
    // espejos (apenas sobresalen)
    octx.fillStyle=bodyColor;
    octx.beginPath(); octx.roundRect(W*0.06, H*0.36, W*0.07, H*0.07, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.87, H*0.36, W*0.07, H*0.07, 2); octx.fill();
    // faros delanteros
    octx.fillStyle='#fff0b0';
    octx.beginPath(); octx.roundRect(W*0.26, H*0.05, W*0.13, 5, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.61, H*0.05, W*0.13, 5, 2); octx.fill();
    // faros traseros
    octx.fillStyle='#ff2a2a';
    octx.beginPath(); octx.roundRect(W*0.28, H*0.90, W*0.12, 5, 2); octx.fill();
    octx.beginPath(); octx.roundRect(W*0.60, H*0.90, W*0.12, 5, 2); octx.fill();
  }
}

const SPRITE_COLORS={
  car:['#e84c4c','#3a7bd5','#2ecc71','#f39c12','#9b59b6','#ecf0f1','#1abc9c','#e67e22'],
  sport:['#e74c3c','#f1c40f','#3498db','#2c3e50','#e91e63'],
  van:['#95a5a6','#34495e','#27ae60','#d35400','#8e44ad'],
  truck:['#c0392b','#2980b9','#16a085','#7f8c8d','#f39c12'],
  bus:['#e74c3c','#3498db','#f1c40f','#2ecc71','#ecf0f1']
};

function ensureSprites(){
  if(vehicleSprites._v2) return; vehicleSprites._v2=true;
  ['car','sport','van','truck','bus'].forEach(style=>{
    vehicleSprites[style]=SPRITE_COLORS[style].map(col=>{
      const w = style==='bus'?72:(style==='truck'?68:(style==='sport'?64:64));
      const h = style==='bus'?132:(style==='truck'?120:(style==='van'?110:(style==='sport'?90:102)));
      return makeSprite((ctx,W,H)=>paintCar(ctx,W,H,col,style), w, h);
    });
  });
}

let actx=null, masterGain=null, engineNodes=null, musicPlaying=false, musicTimer=null, musicBar=0;
let musicMuted=localStorage.getItem('carreteraMuteMusic')==='1';
let sfxMuted=localStorage.getItem('carreteraMuteSfx')==='1';
function initAudio(){ if(actx) return; actx=new (window.AudioContext||window.webkitAudioContext)(); masterGain=actx.createGain(); masterGain.gain.value=0.55; masterGain.connect(actx.destination); musicGain=actx.createGain(); musicGain.gain.value=musicMuted?0:1; musicGain.connect(masterGain); sfxGain=actx.createGain(); sfxGain.gain.value=sfxMuted?0:1; sfxGain.connect(masterGain); }
let musicGain=null, sfxGain=null;
function applyMuteGains(){
  if(musicGain) musicGain.gain.value = musicMuted ? 0 : 1;
  if(sfxGain) sfxGain.gain.value = sfxMuted ? 0 : 1;
}
function toggleMusicMute(){
  musicMuted = !musicMuted;
  localStorage.setItem('carreteraMuteMusic', musicMuted?'1':'0');
  applyMuteGains();
  updateMuteUI();
  if(musicMuted){ try{ /* deja de sonar pero mantiene estado */ }catch(e){} }
  else if(running && !paused){ try{ resumeAudio(); if(!musicPlaying) startMusic(); }catch(e){} }
}
function toggleSfxMute(){
  sfxMuted = !sfxMuted;
  localStorage.setItem('carreteraMuteSfx', sfxMuted?'1':'0');
  applyMuteGains();
  updateMuteUI();
  if(sfxMuted){ try{ stopSiren(); }catch(e){} if(engineNodes) try{ engineNodes.engGain.gain.value=0; }catch(e){} }
  else if(running && !paused && gameMode==='chase' && chaseIntroDone){ try{ startSiren(); }catch(e){} }
}
function updateMuteUI(){
  const mb=document.getElementById('muteMusicBtn');
  const sb=document.getElementById('muteSfxBtn');
  if(mb){ mb.textContent = musicMuted ? '🎵🚫' : '🎵'; mb.classList.toggle('muted', musicMuted); mb.title = musicMuted ? 'Activar música' : 'Silenciar música'; }
  if(sb){ sb.textContent = sfxMuted ? '🔇' : '🔊'; sb.classList.toggle('muted', sfxMuted); sb.title = sfxMuted ? 'Activar efectos' : 'Silenciar efectos'; }
}
function resumeAudio(){ initAudio(); if(actx.state==='suspended') actx.resume(); }
function createNoiseBuffer(sec=1){ const len=actx.sampleRate*sec; const buf=actx.createBuffer(1,len,actx.sampleRate); const d=buf.getChannelData(0); for(let i=0;i<len;i++) d[i]=Math.random()*2-1; return buf; }
function startEngine(){
  resumeAudio(); stopEngine();
  const noise=actx.createBufferSource(); noise.buffer=createNoiseBuffer(2); noise.loop=true;
  const filter=actx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=280; filter.Q.value=0.7;
  const engGain=actx.createGain(); engGain.gain.value=0.12;
  const osc=actx.createOscillator(); osc.type='sawtooth'; osc.frequency.value=48;
  const oscGain=actx.createGain(); oscGain.gain.value=0.04;
  const oscFilter=actx.createBiquadFilter(); oscFilter.type='lowpass'; oscFilter.frequency.value=120;
  noise.connect(filter); filter.connect(engGain); engGain.connect(masterGain);
  osc.connect(oscFilter); oscFilter.connect(oscGain); oscGain.connect(masterGain);
  noise.start(); osc.start(); engineNodes={noise,osc,engGain,filter,oscGain};
}
function updateEngine(spd){ if(!engineNodes||sfxMuted) return; const t=actx.currentTime; engineNodes.osc.frequency.setTargetAtTime(48+(spd-260)*0.12,t,0.1); engineNodes.filter.frequency.setTargetAtTime(220+spd*0.35,t,0.1); engineNodes.engGain.gain.setTargetAtTime(0.08+Math.min(spd/900,0.08),t,0.15); }
function stopEngine(){ if(!engineNodes) return; try{engineNodes.noise.stop()}catch(e){} try{engineNodes.osc.stop()}catch(e){} engineNodes=null; }
function playCrash(){
  if(sfxMuted) return;
  resumeAudio(); const t=actx.currentTime;
  const osc=actx.createOscillator(); osc.type='sine'; osc.frequency.setValueAtTime(90,t); osc.frequency.exponentialRampToValueAtTime(25,t+0.45);
  const g=actx.createGain(); g.gain.setValueAtTime(0.7,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.5);
  osc.connect(g); g.connect(masterGain); osc.start(t); osc.stop(t+0.55);
  const noise=actx.createBufferSource(); noise.buffer=createNoiseBuffer(0.6);
  const nf=actx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=800; nf.Q.value=0.6;
  const ng=actx.createGain(); ng.gain.setValueAtTime(0.55,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.55);
  noise.connect(nf); nf.connect(ng); ng.connect(masterGain); noise.start(t); noise.stop(t+0.6);
  const osc2=actx.createOscillator(); osc2.type='triangle'; osc2.frequency.setValueAtTime(220,t+0.05); osc2.frequency.exponentialRampToValueAtTime(40,t+0.3);
  const g2=actx.createGain(); g2.gain.setValueAtTime(0.35,t+0.05); g2.gain.exponentialRampToValueAtTime(0.001,t+0.35);
  osc2.connect(g2); g2.connect(masterGain); osc2.start(t+0.05); osc2.stop(t+0.4);
}
/* Sonidos persecución */
function playGunshot(){
  try{
    if(sfxMuted) return;
    resumeAudio(); const t=actx.currentTime;
    // click metálico inicial
    const click=actx.createOscillator(); click.type='square';
    click.frequency.setValueAtTime(1800,t); click.frequency.exponentialRampToValueAtTime(200,t+0.04);
    const cg=actx.createGain(); cg.gain.setValueAtTime(0.22,t); cg.gain.exponentialRampToValueAtTime(0.001,t+0.06);
    const cf=actx.createBiquadFilter(); cf.type='highpass'; cf.frequency.value=800;
    click.connect(cf); cf.connect(cg); cg.connect(masterGain); click.start(t); click.stop(t+0.07);
    // body noise (pólvora)
    const n=actx.createBufferSource(); n.buffer=createNoiseBuffer(0.25);
    const nf=actx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.setValueAtTime(1200,t); nf.frequency.exponentialRampToValueAtTime(280,t+0.12); nf.Q.value=0.8;
    const ng=actx.createGain(); ng.gain.setValueAtTime(0.55,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.18);
    n.connect(nf); nf.connect(ng); ng.connect(masterGain); n.start(t); n.stop(t+0.2);
    // low thump
    const th=actx.createOscillator(); th.type='sine';
    th.frequency.setValueAtTime(140,t); th.frequency.exponentialRampToValueAtTime(45,t+0.1);
    const tg=actx.createGain(); tg.gain.setValueAtTime(0.35,t); tg.gain.exponentialRampToValueAtTime(0.001,t+0.12);
    th.connect(tg); tg.connect(masterGain); th.start(t); th.stop(t+0.13);
  }catch(e){}
}
function playMissileLaunch(){
  try{
    if(sfxMuted) return;
    resumeAudio(); const t=actx.currentTime;
    // whoosh noise
    const n=actx.createBufferSource(); n.buffer=createNoiseBuffer(0.8);
    const nf=actx.createBiquadFilter(); nf.type='bandpass';
    nf.frequency.setValueAtTime(400,t); nf.frequency.exponentialRampToValueAtTime(1800,t+0.35); nf.Q.value=0.7;
    const ng=actx.createGain(); ng.gain.setValueAtTime(0.05,t); ng.gain.linearRampToValueAtTime(0.4,t+0.08); ng.gain.exponentialRampToValueAtTime(0.001,t+0.7);
    n.connect(nf); nf.connect(ng); ng.connect(masterGain); n.start(t); n.stop(t+0.75);
    // engine-like tone
    const o=actx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(90,t); o.frequency.exponentialRampToValueAtTime(280,t+0.4);
    const og=actx.createGain(); og.gain.setValueAtTime(0.12,t); og.gain.exponentialRampToValueAtTime(0.001,t+0.55);
    const of=actx.createBiquadFilter(); of.type='lowpass'; of.frequency.value=900;
    o.connect(of); of.connect(og); og.connect(masterGain); o.start(t); o.stop(t+0.6);
  }catch(e){}
}
function playHitImpact(){
  try{
    if(sfxMuted) return;
    resumeAudio(); const t=actx.currentTime;
    // metal hit
    const o=actx.createOscillator(); o.type='triangle';
    o.frequency.setValueAtTime(320,t); o.frequency.exponentialRampToValueAtTime(60,t+0.25);
    const g=actx.createGain(); g.gain.setValueAtTime(0.45,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.3);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t+0.32);
    const n=actx.createBufferSource(); n.buffer=createNoiseBuffer(0.35);
    const nf=actx.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value=900;
    const ng=actx.createGain(); ng.gain.setValueAtTime(0.4,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.3);
    n.connect(nf); nf.connect(ng); ng.connect(masterGain); n.start(t); n.stop(t+0.35);
    // glass-ish high
    const o2=actx.createOscillator(); o2.type='sine';
    o2.frequency.setValueAtTime(1400,t+0.02); o2.frequency.exponentialRampToValueAtTime(400,t+0.15);
    const g2=actx.createGain(); g2.gain.setValueAtTime(0.12,t+0.02); g2.gain.exponentialRampToValueAtTime(0.001,t+0.18);
    o2.connect(g2); g2.connect(masterGain); o2.start(t+0.02); o2.stop(t+0.2);
  }catch(e){}
}
let sirenNodes=null, sirenTimer=null, sirenOn=false;
function startSiren(){
  try{
    if(sfxMuted) return;
    resumeAudio(); stopSiren();
    sirenOn=true;
    const g=actx.createGain(); g.gain.value=0.022; g.connect(sfxGain||masterGain);
    const o1=actx.createOscillator(); o1.type='sine'; o1.frequency.value=650;
    const o2=actx.createOscillator(); o2.type='sine'; o2.frequency.value=900;
    o1.connect(g); o2.connect(g);
    o1.start(); o2.start();
    sirenNodes={o1,o2,g};
    let hi=true;
    function tick(){
      if(!sirenOn||!sirenNodes) return;
      const t=actx.currentTime;
      if(hi){
        sirenNodes.o1.frequency.setTargetAtTime(780,t,0.05);
        sirenNodes.o2.frequency.setTargetAtTime(1050,t,0.05);
      } else {
        sirenNodes.o1.frequency.setTargetAtTime(520,t,0.05);
        sirenNodes.o2.frequency.setTargetAtTime(720,t,0.05);
      }
      hi=!hi;
      sirenTimer=setTimeout(tick, 320);
    }
    tick();
  }catch(e){}
}
function stopSiren(){
  sirenOn=false;
  if(sirenTimer){clearTimeout(sirenTimer);sirenTimer=null}
  if(sirenNodes){
    try{sirenNodes.o1.stop()}catch(e){}
    try{sirenNodes.o2.stop()}catch(e){}
    sirenNodes=null;
  }
}

function playGameOverMusic(){
  if(musicMuted) return;
  resumeAudio(); const t=actx.currentTime;
  const chords=[[220,261.63,329.63],[196,246.94,293.66],[174.61,220,261.63],[146.83,174.61,220],[130.81,164.81,196],[110,130.81,164.81]];
  chords.forEach((notes,i)=>{ const t0=t+i*0.55; notes.forEach((freq,j)=>{
    const osc=actx.createOscillator(); osc.type=j===0?'triangle':'sine'; osc.frequency.value=freq;
    const g=actx.createGain(); g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(j===0?0.12:0.06,t0+0.08); g.gain.setValueAtTime(j===0?0.12:0.06,t0+0.4); g.gain.linearRampToValueAtTime(0,t0+0.7);
    const f=actx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=1400; osc.connect(f); f.connect(g); g.connect(masterGain); osc.start(t0); osc.stop(t0+0.75);
  }); });
  const melody=[329.63,293.66,261.63,246.94,220,196,174.61,164.81];
  melody.forEach((freq,i)=>{ const t0=t+i*0.35; const osc=actx.createOscillator(); osc.type='sine'; osc.frequency.value=freq;
    const g=actx.createGain(); g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(0.1,t0+0.05); g.gain.linearRampToValueAtTime(0,t0+0.4);
    osc.connect(g); g.connect(masterGain); osc.start(t0); osc.stop(t0+0.45); });
}



/* ===== MÚSICA CON ARCHIVOS DE AUDIO =====
   Archivos en assets/. Formatos recomendados: .mp3 o .ogg
*/
const MUSIC_FILES = {
  classic: 'assets/cancion_clasico.mp3',   // modo clásico
  chase:   'assets/cancion_persecucion.mp3', // persecución normal
  fight:   'assets/cancion_lucha.mp3'      // fase de pelea
};

let musicAudio = null;
let currentMusicKey = null;

function getMusicKey(){
  if(typeof actionMusic !== 'undefined' && actionMusic) return 'fight';
  if(typeof gameMode !== 'undefined' && gameMode === 'chase') return 'chase';
  return 'classic';
}

function startMusic(){
  try{
    resumeAudio();
    if(musicMuted) return;
    const key = getMusicKey();
    if(musicPlaying && currentMusicKey === key && musicAudio && !musicAudio.paused){
      return;
    }
    stopMusic();
    const src = (typeof MUSIC_FILES !== 'undefined' && MUSIC_FILES[key]) ? MUSIC_FILES[key] : null;
    if(!src) return;
    musicAudio = new Audio(src);
    musicAudio.loop = true;
    musicAudio.volume = 0.45;
    currentMusicKey = key;
    musicPlaying = true;
    musicAudio.onerror = function(){ console.warn('No se pudo cargar música:', src); musicPlaying=false; };
    const p = musicAudio.play();
    if(p && p.catch) p.catch(function(err){ console.warn('play música:', err); });
  }catch(e){ console.warn(e); }
}

function stopMusic(){
  musicPlaying = false;
  if(musicTimer){ try{ clearTimeout(musicTimer); }catch(e){} musicTimer=null; }
  if(musicAudio){
    try{ musicAudio.pause(); }catch(e){}
    try{ musicAudio.src = ''; }catch(e){}
    musicAudio = null;
  }
  currentMusicKey = null;
}

function setMusicVolume(v){
  if(musicAudio) musicAudio.volume = Math.max(0, Math.min(1, v));
}

function rounded(x,y,w,h,r,fill,stroke){ ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill(); if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()} }

/* Scroll unificado de ambientacion (arriba -> abajo, misma velocidad) */
function worldScrollY(slot, spacing){
  const scroll = (typeof ambientScroll === 'number') ? ambientScroll : roadOffset;
  return scroll - slot * spacing;
}
function worldSlots(spacing){
  const scroll = (typeof ambientScroll === 'number') ? ambientScroll : roadOffset;
  const base = Math.floor(scroll / spacing);
  const list = [];
  for(let i = -2; i < Math.ceil(H / spacing) + 3; i++){
    const slot = base - i;
    const y = worldScrollY(slot, spacing);
    if(y >= -80 && y <= H + 80) list.push({slot, y});
  }
  return list;
}

/* ===== Ambientación lateral por mapa (arriba → abajo, suave) ===== */
function drawMapAmbient(apoc){
  const map = (typeof getMap === 'function') ? getMap() : null;
  const decor = (map && map.decor) ? map.decor : 'palm';
  if(apoc > 0.9) return;

  const leftMax = ROAD_LEFT - 8;
  const rightMin = ROAD_RIGHT + 8;
  const spacing = LANDSCAPE ? 105 : 125;
  // parallax un poco más lento = sensación más natural
  const scroll = (typeof ambientScroll === 'number' ? ambientScroll : roadOffset);

  function hash(n){
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // scroll aumenta → objetos bajan (entran arriba, salen abajo)
  const baseSlot = Math.floor(scroll / spacing);

  for(let i = -2; i < Math.ceil(H / spacing) + 3; i++){
    const slot = baseSlot - i; // slots del mundo
    // y = scroll - slot*spacing  → al subir scroll, y sube (baja en pantalla)
    const y = scroll - slot * spacing;
    if(y < -70 || y > H + 70) continue;

    const h1 = hash(slot * 2.17);
    const h2 = hash(slot * 5.91 + 1.3);
    const h3 = hash(slot * 9.3 + 4.7);
    const side = (Math.abs(slot) % 2 === 0) ? 'L' : 'R';
    const cx = side === 'L'
      ? 10 + h1 * Math.max(6, leftMax - 30)
      : rightMin + h1 * Math.max(6, W - rightMin - 30);

    if(apoc > 0.45 && h2 > 0.5) continue;

    if(decor === 'palm'){
      const kind = Math.floor(h2 * 5);
      if(kind === 0 || kind === 1){
        ctx.strokeStyle = '#5a3a18';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, y + 28);
        ctx.quadraticCurveTo(cx + (side==='L'?4:-4), y + 10, cx, y - 8);
        ctx.stroke();
        ctx.fillStyle = apoc > 0.3 ? '#4a5a20' : '#2a8a3a';
        for(let a = -1; a <= 1; a++){
          ctx.beginPath();
          ctx.ellipse(cx + a * 10, y - 6, 12, 5, a * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if(kind === 2){
        ctx.fillStyle = '#5a6068';
        ctx.beginPath();
        ctx.ellipse(cx, y + 8, 10 + h3 * 8, 6 + h3 * 4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if(kind === 3){
        ctx.fillStyle = '#8a6a40';
        ctx.fillRect(cx - 1, y - 5, 3, 28);
        ctx.fillStyle = '#e8c84a';
        ctx.fillRect(cx - 14, y - 18, 28, 14);
        ctx.fillStyle = '#1a3050';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PLAYA', cx, y - 8);
      } else {
        ctx.fillStyle = '#e8d8c0';
        ctx.fillRect(cx - 12, y + 2, 24, 16);
        ctx.fillStyle = '#c04030';
        ctx.beginPath();
        ctx.moveTo(cx - 14, y + 2);
        ctx.lineTo(cx, y - 12);
        ctx.lineTo(cx + 14, y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#4a80c0';
        ctx.fillRect(cx - 4, y + 8, 6, 8);
      }
    } else if(decor === 'cactus'){
      const kind = Math.floor(h2 * 5);
      if(kind <= 1){
        ctx.fillStyle = apoc > 0.3 ? '#3a5a30' : '#2a7a38';
        ctx.fillRect(cx - 3, y - 5, 6, 28);
        ctx.fillRect(cx - 12, y + 2, 10, 5);
        ctx.fillRect(cx - 12, y + 2, 4, 12);
        ctx.fillRect(cx + 2, y + 8, 10, 5);
        ctx.fillRect(cx + 8, y + 8, 4, 10);
      } else if(kind === 2){
        ctx.fillStyle = '#a08050';
        ctx.beginPath();
        ctx.ellipse(cx, y + 12, 14 + h3 * 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if(kind === 3){
        ctx.fillStyle = '#6a5040';
        ctx.fillRect(cx - 1, y - 2, 3, 26);
        ctx.fillStyle = '#c87820';
        ctx.fillRect(cx - 16, y - 16, 32, 14);
        ctx.fillStyle = '#1a1008';
        ctx.font = 'bold 6px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DESIERTO', cx, y - 6);
      } else {
        ctx.fillStyle = '#b89858';
        ctx.beginPath();
        ctx.moveTo(cx - 16, y + 18);
        ctx.quadraticCurveTo(cx, y - 4, cx + 16, y + 18);
        ctx.fill();
      }
    } else if(decor === 'pine'){
      const kind = Math.floor(h2 * 5);
      if(kind <= 1){
        ctx.fillStyle = '#4a3020';
        ctx.fillRect(cx - 2, y + 10, 4, 14);
        ctx.fillStyle = apoc > 0.3 ? '#3a4a38' : '#1a5a30';
        for(let t = 0; t < 3; t++){
          const ty = y + 8 - t * 12;
          const tw = 16 - t * 4;
          ctx.beginPath();
          ctx.moveTo(cx, ty - 14);
          ctx.lineTo(cx - tw, ty + 6);
          ctx.lineTo(cx + tw, ty + 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(240,248,255,0.7)';
        ctx.beginPath();
        ctx.moveTo(cx, y - 28);
        ctx.lineTo(cx - 6, y - 18);
        ctx.lineTo(cx + 6, y - 18);
        ctx.closePath();
        ctx.fill();
      } else if(kind === 2){
        ctx.fillStyle = '#6a4030';
        ctx.fillRect(cx - 14, y + 2, 28, 18);
        ctx.fillStyle = '#3a2010';
        ctx.beginPath();
        ctx.moveTo(cx - 16, y + 2);
        ctx.lineTo(cx, y - 14);
        ctx.lineTo(cx + 16, y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c0e0ff';
        ctx.fillRect(cx - 4, y + 8, 7, 8);
      } else if(kind === 3){
        ctx.fillStyle = '#8a9aa8';
        ctx.fillRect(cx - 1, y - 2, 3, 28);
        ctx.fillStyle = '#e8f0f8';
        ctx.beginPath();
        ctx.arc(cx, y - 6, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#e8f0f8';
        ctx.beginPath();
        ctx.ellipse(cx, y + 12, 12 + h3 * 8, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if(decor === 'neon'){
      const kind = Math.floor(h2 * 6);
      if(kind <= 1){
        const bh = 30 + h3 * 40;
        ctx.fillStyle = '#1a1528';
        ctx.fillRect(cx - 12, y + 20 - bh, 24, bh);
        for(let wy = y + 24 - bh; wy < y + 16; wy += 8){
          for(let wx = -8; wx <= 6; wx += 8){
            if(hash(slot * 10 + wy + wx) > 0.4){
              ctx.fillStyle = hash(slot + wy * 2) > 0.5 ? '#ffcc60' : '#60a0ff';
              ctx.fillRect(cx + wx, wy, 4, 4);
            }
          }
        }
      } else if(kind === 2){
        ctx.fillStyle = '#4a4a58';
        ctx.fillRect(cx - 1, y - 10, 3, 32);
        ctx.fillStyle = 'rgba(255,220,120,0.85)';
        ctx.beginPath();
        ctx.arc(cx, y - 12, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,200,80,0.15)';
        ctx.beginPath();
        ctx.arc(cx, y - 12, 14, 0, Math.PI * 2);
        ctx.fill();
      } else if(kind === 3){
        ctx.fillStyle = '#2a2038';
        ctx.fillRect(cx - 1, y - 5, 3, 28);
        const neon = (Math.floor(performance.now() / 500) + slot) % 2 === 0;
        ctx.fillStyle = neon ? '#ff40a0' : '#40e0ff';
        ctx.fillRect(cx - 16, y - 20, 32, 14);
        ctx.fillStyle = '#0a0812';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('OPEN', cx, y - 10);
      } else if(kind === 4){
        ctx.fillStyle = '#3a4050';
        ctx.fillRect(cx - 10, y + 6, 20, 14);
        ctx.fillStyle = '#2a3038';
        ctx.fillRect(cx - 10, y + 4, 20, 3);
      } else {
        ctx.strokeStyle = '#6a7080';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, y + 20);
        ctx.lineTo(cx, y - 20);
        ctx.stroke();
        ctx.fillStyle = '#ff4060';
        ctx.beginPath();
        ctx.arc(cx, y - 22, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // textura lateral (misma dirección)
  const texSpace = 80;
  const texScroll = scroll;
  const texBase = Math.floor(texScroll / texSpace);
  for(let i = -1; i < Math.ceil(H / texSpace) + 2; i++){
    const slot = texBase - i;
    const y = texScroll - slot * texSpace;
    if(y < -20 || y > H + 20) continue;
    if(decor === 'pine'){
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
    } else if(decor === 'cactus'){
      ctx.fillStyle = 'rgba(180,140,60,0.1)';
    } else if(decor === 'neon'){
      ctx.fillStyle = 'rgba(80,40,120,0.08)';
    } else {
      ctx.fillStyle = apoc > 0 ? 'rgba(80,40,20,0.1)' : 'rgba(60,120,50,0.1)';
    }
    ctx.fillRect(2, y, ROAD_LEFT - 4, 12);
    ctx.fillRect(ROAD_RIGHT + 2, y + 8, W - ROAD_RIGHT - 4, 12);
  }
}

function road(){
  const apoc = (typeof getApoc === 'function') ? getApoc() : 0;
  const mapTheme = (typeof getMap === 'function') ? getMap() : null;

  // asfalto (más oscuro / rojizo en apocalipsis)
  let g = ctx.createLinearGradient(0, 0, W, 0);
  if(apoc > 0){
    g.addColorStop(0, '#1a1210');
    g.addColorStop(0.10, '#2a1e18');
    g.addColorStop(0.18, '#3a2a22');
    g.addColorStop(0.50, '#322820');
    g.addColorStop(0.82, '#3a2a22');
    g.addColorStop(0.90, '#2a1e18');
    g.addColorStop(1, '#1a1210');
  } else if(mapTheme){
    g.addColorStop(0, mapTheme.asphalt[0]);
    g.addColorStop(0.10, mapTheme.asphalt[1]);
    g.addColorStop(0.18, mapTheme.asphalt[2]);
    g.addColorStop(0.50, mapTheme.asphalt[3]);
    g.addColorStop(0.82, mapTheme.asphalt[2]);
    g.addColorStop(0.90, mapTheme.asphalt[1]);
    g.addColorStop(1, mapTheme.asphalt[0]);
  } else {
    g.addColorStop(0, '#1a2228');
    g.addColorStop(0.10, '#2a3238');
    g.addColorStop(0.18, '#3a4248');
    g.addColorStop(0.50, '#343c42');
    g.addColorStop(0.82, '#3a4248');
    g.addColorStop(0.90, '#2a3238');
    g.addColorStop(1, '#1a2228');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // textura (reducida para rendimiento)
  for (let i = 0; i < (LANDSCAPE?28:18); i++) {
    const ax = ROAD_LEFT + 15 + (i * 53 + Math.floor(roadOffset * 0.3)) % Math.max(10, ROAD_RIGHT-ROAD_LEFT-30);
    const ay = ((i * 79 + Math.floor(roadOffset * 0.7)) % H);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(ax, ay, 2 + (i % 3), 1 + (i % 2));
  }

  // arcén
  ctx.fillStyle = apoc > 0.3 ? '#3a3028' : (mapTheme ? mapTheme.edge : '#4a4538');
  ctx.fillRect(ROAD_LEFT, 0, 10, H);
  ctx.fillRect(ROAD_RIGHT - 10, 0, 10, H);
  // línea de borde
  ctx.fillStyle = apoc > 0.5 ? '#8a6a20' : (mapTheme ? mapTheme.edge : '#e8c84a');
  ctx.fillRect(ROAD_LEFT + 8, 0, 3, H);
  ctx.fillRect(ROAD_RIGHT - 11, 0, 3, H);

  // laterales: según mapa (o apocalipsis)
  const grassG = ctx.createLinearGradient(0, 0, ROAD_LEFT, 0);
  if(apoc > 0){
    grassG.addColorStop(0, '#1a1008');
    grassG.addColorStop(0.5, '#2a1a10');
    grassG.addColorStop(1, '#3a2818');
  } else if(mapTheme){
    grassG.addColorStop(0, mapTheme.sideL[0]);
    grassG.addColorStop(1, mapTheme.sideL[1]);
  } else {
    grassG.addColorStop(0, '#1a3a22');
    grassG.addColorStop(1, '#2a4a32');
  }
  ctx.fillStyle = grassG;
  ctx.fillRect(0, 0, ROAD_LEFT, H);
  const grassG2 = ctx.createLinearGradient(ROAD_RIGHT, 0, W, 0);
  if(apoc > 0){
    grassG2.addColorStop(0, '#3a2818');
    grassG2.addColorStop(0.5, '#2a1a10');
    grassG2.addColorStop(1, '#1a1008');
  } else if(mapTheme){
    grassG2.addColorStop(0, mapTheme.sideR[1]);
    grassG2.addColorStop(1, mapTheme.sideR[0]);
  } else {
    grassG2.addColorStop(0, '#2a4a32');
    grassG2.addColorStop(1, '#1a3a22');
  }
  ctx.fillStyle = grassG2;
  ctx.fillRect(ROAD_RIGHT, 0, W - ROAD_RIGHT, H);

  drawMapAmbient(apoc);

  // líneas de carril
  ctx.fillStyle = apoc > 0.4 ? '#8a8070' : ((mapTheme && mapTheme.line) ? mapTheme.line : '#d8dce0');
  const mid1 = (lanes[0] + lanes[1]) / 2;
  const mid2 = (lanes[1] + lanes[2]) / 2;
  for (let x of [mid1, mid2]) {
    for(const {y} of worldSlots(90)){
      ctx.beginPath();
      ctx.roundRect(x - 2.5, y, 5, 42, 2);
      ctx.fill();
    }
  }

  // reflectores (rotos en apocalipsis)
  for (const {y, slot} of worldSlots(100)) {
    if(apoc > 0.6 && (Math.abs(slot) % 3 === 0)) continue;
    ctx.fillStyle = apoc > 0.3 ? '#6a5040' : '#c8e0c0';
    ctx.beginPath(); ctx.roundRect(ROAD_LEFT - 6, y, 5, 14, 2); ctx.fill();
    ctx.fillStyle = apoc > 0.3 ? '#8a7060' : '#e8f0e8';
    ctx.fillRect(ROAD_LEFT - 5, y + 2, 3, 4);
    ctx.fillStyle = apoc > 0.3 ? '#6a5040' : '#c8e0c0';
    ctx.beginPath(); ctx.roundRect(ROAD_RIGHT + 1, y + 30, 5, 14, 2); ctx.fill();
    ctx.fillStyle = apoc > 0.3 ? '#8a7060' : '#e8f0e8';
    ctx.fillRect(ROAD_RIGHT + 2, y + 32, 3, 4);
  }

  // —— dibujadores de entorno ——
  const drawTree = (x, y, s) => {
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(x - s * 0.08, y - s * 0.15, s * 0.16, s * 0.35);
    ctx.fillStyle = '#1a4a28';
    ctx.beginPath(); ctx.arc(x, y - s * 0.25, s * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a6a38';
    ctx.beginPath(); ctx.arc(x - s * 0.12, y - s * 0.18, s * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.12, y - s * 0.20, s * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a8a48';
    ctx.beginPath(); ctx.arc(x, y - s * 0.32, s * 0.14, 0, Math.PI * 2); ctx.fill();
  };
  const drawDeadTree = (x, y, s) => {
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.1); ctx.lineTo(x, y - s * 0.35); ctx.stroke();
    ctx.lineWidth = s * 0.035;
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.15); ctx.lineTo(x - s * 0.18, y - s * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.2); ctx.lineTo(x + s * 0.15, y - s * 0.32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.28); ctx.lineTo(x - s * 0.1, y - s * 0.4); ctx.stroke();
    ctx.fillStyle = '#2a2010';
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.08, s * 0.12, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  };
  const drawBush = (x, y, s) => {
    ctx.fillStyle = '#2a5a30';
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.3, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a7a40';
    ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.05, s * 0.18, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + s * 0.1, y - s * 0.03, s * 0.15, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  };
  const drawBurntBush = (x, y, s) => {
    ctx.fillStyle = '#2a1a10';
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.28, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2a18';
    ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.04, s * 0.14, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(60,40,20,0.5)';
    ctx.beginPath(); ctx.ellipse(x + s * 0.08, y, s * 0.1, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  };
  const drawSign = (x, y, type) => {
    ctx.fillStyle = '#555';
    ctx.fillRect(x - 2, y - 5, 4, 40);
    if (type === 0) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y - 18, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e03030'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - 18, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('60', x, y - 14);
    } else if (type === 1) {
      ctx.fillStyle = '#f0c020';
      ctx.beginPath();
      ctx.moveTo(x, y - 32); ctx.lineTo(x + 12, y - 8); ctx.lineTo(x - 12, y - 8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', x, y - 14);
    } else {
      ctx.fillStyle = '#2a6ab0';
      ctx.beginPath(); ctx.roundRect(x - 16, y - 28, 32, 16, 3); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('→ CITY', x, y - 17);
    }
  };
  const drawBrokenSign = (x, y) => {
    ctx.fillStyle = '#444';
    ctx.fillRect(x - 2, y, 4, 28);
    ctx.save();
    ctx.translate(x + 6, y - 8);
    ctx.rotate(0.4);
    ctx.fillStyle = '#8a2020';
    ctx.beginPath(); ctx.roundRect(-14, -10, 28, 14, 2); ctx.fill();
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DANGER', 0, -1);
    ctx.restore();
  };
  const drawRock = (x, y, s) => {
    ctx.fillStyle = '#5a5a50';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.2, y);
    ctx.lineTo(x - s * 0.1, y - s * 0.15);
    ctx.lineTo(x + s * 0.15, y - s * 0.12);
    ctx.lineTo(x + s * 0.2, y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a6a60';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.05, s * 0.12, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const drawRubble = (x, y, s) => {
    ctx.fillStyle = '#4a4038';
    ctx.beginPath(); ctx.moveTo(x - s*0.25, y); ctx.lineTo(x - s*0.1, y - s*0.12); ctx.lineTo(x + s*0.05, y - s*0.08); ctx.lineTo(x + s*0.2, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a5048';
    ctx.fillRect(x - s*0.08, y - s*0.18, s*0.12, s*0.1);
    ctx.fillStyle = '#3a3530';
    ctx.beginPath(); ctx.ellipse(x + s*0.1, y - s*0.04, s*0.08, s*0.04, 0.3, 0, Math.PI*2); ctx.fill();
  };
  const drawFire = (x, y, s) => {
    ctx.fillStyle = 'rgba(255,90,20,0.4)';
    ctx.beginPath(); ctx.arc(x, y - s*0.12, s*0.18, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,50,0.45)';
    ctx.beginPath(); ctx.arc(x, y - s*0.18, s*0.09, 0, Math.PI*2); ctx.fill();
  };
  const drawSmoke = (x, y, s) => {
    ctx.fillStyle = 'rgba(40,35,30,0.22)';
    ctx.beginPath(); ctx.arc(x, y - s*0.25, s*0.2, 0, Math.PI*2); ctx.fill();
  };
  const drawWreck = (x, y, s) => {
    ctx.fillStyle = '#3a3030';
    ctx.beginPath(); ctx.roundRect(x - s*0.2, y - s*0.08, s*0.4, s*0.16, 3); ctx.fill();
    ctx.fillStyle = '#2a2020';
    ctx.beginPath(); ctx.roundRect(x - s*0.12, y - s*0.14, s*0.24, s*0.08, 2); ctx.fill();
    ctx.fillStyle = '#1a1010';
    ctx.beginPath(); ctx.arc(x - s*0.14, y + s*0.06, s*0.05, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s*0.14, y + s*0.06, s*0.05, 0, Math.PI*2); ctx.fill();
    if(apoc > 0.4) drawSmoke(x, y - s*0.1, s*0.6);
  };
  const drawCactus = (x, y, s) => {
    ctx.fillStyle = '#2a5a30';
    ctx.fillRect(x - s*0.06, y - s*0.3, s*0.12, s*0.35);
    ctx.fillRect(x - s*0.18, y - s*0.18, s*0.12, s*0.08);
    ctx.fillRect(x - s*0.18, y - s*0.22, s*0.08, s*0.12);
    ctx.fillRect(x + s*0.06, y - s*0.12, s*0.12, s*0.08);
    ctx.fillRect(x + s*0.1, y - s*0.16, s*0.08, s*0.1);
  };

  // objetos laterales (misma logica worldScrollY)
  const sideSpace = LANDSCAPE ? 100 : 115;
  for(const {slot, y: baseY} of worldSlots(sideSpace)){
    const side = (Math.abs(slot) % 2 === 0) ? 'left' : 'right';
    const kind = Math.abs(slot) % 11;
    const lx = ROAD_LEFT / 2;
    const rx = ROAD_RIGHT + (W - ROAD_RIGHT) / 2;
    const jitter = ((Math.abs(slot) * 17) % 5) - 2;
    const px = side === 'left' ? lx + jitter : rx - jitter;
    const signX = side === 'left' ? Math.max(14, ROAD_LEFT - 18) : Math.min(W - 14, ROAD_RIGHT + 18);

    if(apoc > 0.15){
      if(kind === 0 || kind === 1) drawDeadTree(px, baseY, 48 + (Math.abs(slot) % 5) * 7);
      else if(kind === 2) drawBurntBush(px, baseY, 36 + (Math.abs(slot) % 3) * 6);
      else if(kind === 3) drawBrokenSign(signX, baseY);
      else if(kind === 4) drawRubble(px, baseY, 32 + (Math.abs(slot) % 4) * 5);
      else if(kind === 5) drawFire(px, baseY, 28 + (Math.abs(slot) % 3) * 6);
      else if(kind === 6) drawWreck(px, baseY, 40 + (Math.abs(slot) % 3) * 8);
      else if(kind === 7) drawRock(px, baseY, 28 + (Math.abs(slot) % 3) * 6);
      else if(kind === 8){ drawDeadTree(px - 8, baseY, 40); drawSmoke(px, baseY - 20, 30); }
      else if(kind === 9) drawRubble(px + 4, baseY, 26);
      else drawCactus(px, baseY, 35 + (Math.abs(slot) % 3) * 5);
    } else {
      if(kind === 0 || kind === 1) drawTree(px, baseY, 50 + (Math.abs(slot) % 4) * 8);
      else if(kind === 2) drawBush(px, baseY, 40 + (Math.abs(slot) % 3) * 5);
      else if(kind === 3) drawSign(signX, baseY, Math.abs(slot) % 3);
      else if(kind === 4) drawRock(px, baseY, 30);
      else if(kind === 5) drawBush(px + 4, baseY, 35);
      else if(kind === 6) drawTree(px - 6, baseY, 45);
      else if(kind === 7) drawCactus(px, baseY, 32);
      else if(kind === 8) drawRock(px, baseY, 22);
      else if(kind === 9) drawSign(signX, baseY, (Math.abs(slot) + 1) % 3);
      else drawBush(px, baseY, 30);
    }
  }

  // manchas / aceite
  const oilSpace = 160;
  let oilI = 0;
  for(const {slot, y: oy} of worldSlots(oilSpace)){
    if(oilI >= (apoc > 0 ? 7 : 4)) break;
    if (oy > 20 && oy < H - 20) {
      const ox = ROAD_LEFT + 40 + ((Math.abs(slot) * 97) % Math.max(20, ROAD_RIGHT - ROAD_LEFT - 80));
      ctx.fillStyle = apoc > 0 ? 'rgba(20,10,5,0.35)' : 'rgba(20,20,30,0.25)';
      ctx.beginPath();
      ctx.ellipse(ox, oy, 12 + oilI * 2, 6 + oilI, oilI * 0.5, 0, Math.PI * 2);
      ctx.fill();
      oilI++;
    }
  }

  // grietas
  const nCracks = apoc > 0 ? 5 + Math.floor(apoc * 3) : 2;
  ctx.strokeStyle = apoc > 0 ? `rgba(10,5,0,${0.25 + apoc * 0.35})` : 'rgba(0,0,0,0.12)';
  ctx.lineWidth = apoc > 0 ? 1.5 + apoc * 1.5 : 1;
  let ci = 0;
  for(const {slot, y: cy} of worldSlots(180)){
    if(ci >= nCracks) break;
    if (cy > 20) {
      const cx = ROAD_LEFT + 25 + (Math.abs(slot) * 37) % Math.max(20, ROAD_RIGHT - ROAD_LEFT - 50);
      const len = 25 + apoc * 40 + (Math.abs(slot) % 3) * 10;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 12 + (Math.abs(slot) % 5) * 4, cy + len * 0.4);
      ctx.lineTo(cx + 6 + (Math.abs(slot) % 3) * 3, cy + len * 0.7);
      ctx.lineTo(cx + 18, cy + len);
      ctx.stroke();
      if(apoc > 0.3){
        ctx.beginPath();
        ctx.moveTo(cx + 8, cy + len * 0.3);
        ctx.lineTo(cx - 10, cy + len * 0.55);
        ctx.stroke();
      }
      ci++;
    }
  }

  // grietas grandes en el borde
  if(apoc > 0.2){
    ctx.strokeStyle = `rgba(0,0,0,${0.3 + apoc * 0.4})`;
    ctx.lineWidth = 2 + apoc * 2;
    let gi = 0;
    for(const {slot, y: gy} of worldSlots(220)){
      if(gi >= 4) break;
      ctx.beginPath();
      ctx.moveTo(ROAD_LEFT, gy);
      ctx.quadraticCurveTo(ROAD_LEFT + 15 + apoc * 20, gy + 30, ROAD_LEFT + 8, gy + 60);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ROAD_RIGHT, gy + 40);
      ctx.quadraticCurveTo(ROAD_RIGHT - 15 - apoc * 20, gy + 70, ROAD_RIGHT - 8, gy + 100);
      ctx.stroke();
      gi++;
    }
  }

  // barreras
  const maxBar = apoc > 0 ? 4 : 2;
  let bi = 0;
  for(const {slot, y: by} of worldSlots(320)){
    if(bi >= maxBar) break;
    if (by > 0 && by < H) {
      const bx = (Math.abs(slot) % 2 === 0) ? ROAD_LEFT + 14 : ROAD_RIGHT - 34;
      if(apoc > 0.3 && (Math.abs(slot) % 3 === 0)){
        ctx.fillStyle = '#5a4030';
        ctx.save();
        ctx.translate(bx + 10, by + 8);
        ctx.rotate((Math.abs(slot) % 2 === 0 ? -1 : 1) * 0.4);
        ctx.fillRect(-10, -6, 40, 8);
        ctx.restore();
      } else {
        ctx.fillStyle = apoc > 0 ? '#6a5040' : '#c0c8d0';
        ctx.fillRect(bx, by, 40, 8);
        ctx.fillStyle = apoc > 0 ? '#4a3830' : '#a0a8b0';
        ctx.fillRect(bx, by + 8, 8, 12);
        ctx.fillRect(bx + 32, by + 8, 8, 12);
      }
      bi++;
    }
  }

  // velo apocalíptico (humo / polvo rojo)
  if(apoc > 0){
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, `rgba(80,30,10,${0.08 + apoc * 0.18})`);
    veil.addColorStop(0.5, `rgba(40,15,5,${0.04 + apoc * 0.1})`);
    veil.addColorStop(1, `rgba(60,20,8,${0.1 + apoc * 0.2})`);
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawTrafficCar(car, extraAngle=0, scale=1){
  ctx.save();
  ctx.translate(car.x, car.y);
  if(extraAngle) ctx.rotate(extraAngle);
  if(scale!==1) ctx.scale(scale,scale);
  // sin shadowBlur (muy costoso en canvas)
  if(car.photo && car.photo.complete && car.photo.naturalWidth){
    ctx.drawImage(car.photo, -car.w/2, -car.h/2, car.w, car.h);
  } else if(car.sprite && car.sprite.complete && car.sprite.naturalWidth){
    ctx.drawImage(car.sprite, -car.w/2, -car.h/2, car.w, car.h);
  } else {
    ctx.fillStyle=car.color||'#888';
    ctx.fillRect(-car.w/2,-car.h/2,car.w,car.h);
  }
  ctx.restore();
}

const VEHICLE_TYPES=[
  {type:'car',   w:[50,58], h:[92,105], weight:28},
  {type:'sport', w:[52,60], h:[78,90],  weight:16},
  {type:'van',   w:[52,60], h:[100,114], weight:14},
  {type:'truck', w:[54,64], h:[110,126],weight:12},
  {type:'bus',   w:[56,64], h:[122,142],weight:10},
  {type:'photoBus',  w:[58,66], h:[128,145], weight:14},
  {type:'photoTaxi', w:[52,60], h:[96,112],  weight:16}
];

function pickType(){
  const total=VEHICLE_TYPES.reduce((s,v)=>s+v.weight,0);
  let r=Math.random()*total;
  for(const v of VEHICLE_TYPES){ r-=v.weight; if(r<=0) return v; }
  return VEHICLE_TYPES[0];
}

function addTraffic(){
  if(traffic.length>=7) return;
  const laneN=Math.floor(Math.random()*3);
  let near=0;
  for(let i=0;i<traffic.length;i++){const c=traffic[i];if(c.lane===laneN&&c.y<130)near++}
  if(near>=2) return;
  const vt=pickType();
  const w=vt.w[0]+Math.random()*(vt.w[1]-vt.w[0]);
  const h=vt.h[0]+Math.random()*(vt.h[1]-vt.h[0]);
  let sprite=null, photo=null, color='#888';
  if(vt.type==='photoBus'){ photo=photoBus; }
  else if(vt.type==='photoTaxi'){ photo=photoTaxi; }
  else {
    const sprites=vehicleSprites[vt.type]||vehicleSprites.car;
    sprite=sprites[Math.floor(Math.random()*sprites.length)];
  }
  const canLaneChange = score>=120 && Math.random()<0.38 && (vt.type==='car'||vt.type==='sport'||vt.type==='van'||vt.type==='photoTaxi');
  traffic.push({
    lane:laneN, x:lanes[laneN], y:-h-100, w, h,
    type:vt.type, sprite, photo, color,
    speed:speed*(.7+Math.random()*.35),
    canLC:canLaneChange, targetLane:laneN, changing:false, changeT:0,
    changeCooldown:1.5+Math.random()*2.5, fromX:lanes[laneN],
    crashed:false, crashAngle:0, crashVx:0, crashVy:0, crashSpin:0, scale:1
  });
}

function drawPlayer(angle=0, scale=1, ox=0, oy=0){
  ctx.save();
  const px=playerX+ox, py=PLAYER_Y+oy;
  ctx.translate(px, py);
  if(angle) ctx.rotate(angle);
  if(scale!==1) ctx.scale(scale,scale);
  ctx.translate(-px, -py);
  if(playerImg.complete&&playerImg.naturalWidth){
    ctx.drawImage(playerImg, px-(LANDSCAPE?40:48), py-(LANDSCAPE?52:62), LANDSCAPE?80:96, LANDSCAPE?110:130);
  } else {
    ctx.fillStyle='#e5e9ee';
    ctx.fillRect(px-27,py-52,54,105);
  }
  ctx.restore();
}
function collide(a,b){ return Math.abs(a.x-b.x)<(a.w+b.w)*.38 && Math.abs(a.y-b.y)<(a.h+b.h)*.38; }

function spawnCrashParticles(x,y, count=24){
  if(particles.length > 80) return; // tope de rendimiento
  const cols=['#ff6b35','#ffcc00','#ff3300','#ffffff','#ffaa00','#888','#ff5722'];
  const n = Math.min(count, 28);
  for(let i=0;i<n;i++){
    const ang=Math.random()*Math.PI*2, spd=90+Math.random()*260;
    particles.push({x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd-50,life:0.55+Math.random()*0.5,max:0.55+Math.random()*0.5,size:3+Math.random()*7,color:cols[Math.floor(Math.random()*cols.length)],rot:0,vr:0});
  }
  for(let i=0;i<10;i++){
    particles.push({x:x+(Math.random()-0.5)*40,y:y+(Math.random()-0.5)*25,vx:(Math.random()-0.5)*50,vy:-40-Math.random()*70,life:0.8+Math.random()*0.7,max:0.8+Math.random()*0.7,size:12+Math.random()*16,color:'#333',smoke:true,rot:0,vr:0});
  }
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=300*dt; p.life-=dt;
    if(p.smoke){p.vx*=0.95;p.vy*=0.95;p.size+=18*dt}
    if(p.life<=0){particles[i]=particles[particles.length-1];particles.pop()}
  }
}
function drawParticles(){
  for(let i=0;i<particles.length;i++){
    const p=particles[i];
    const a=Math.max(0,p.life/p.max);
    if(p.smoke){
      ctx.globalAlpha=a*0.28;
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
    } else {
      ctx.globalAlpha=a;
      ctx.fillStyle=p.color;
      ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
    }
  }
  ctx.globalAlpha=1;
}


/* ===== POWER-UPS ===== */
const POWER_SHIELD_DUR = 7.5;
const POWER_GHOST_DUR = 6.0;
const POWER_RAMP_DUR = 6.0;
const POWER_GUNS_DUR = 7.0;   // armas laterales
const GUN_FIRE_INTERVAL = 2.0; // una salva (2 balas) cada 2s

function spawnPowerUp(){
  const laneN = Math.floor(Math.random()*3);
  // Probabilidades iguales para que "guns" aparezca a menudo y sea fácil de probar
  let pool;
  if(score >= 200){
    pool = ['shield', 'ghost', 'ramp', 'guns'];
  } else {
    pool = ['shield', 'ghost', 'guns'];
  }
  const type = pool[Math.floor(Math.random() * pool.length)];
  powerUps.push({
    lane: laneN,
    x: lanes[laneN],
    y: -45,
    r: 22,
    rot: 0,
    type: type,
    collected: false
  });
}

function drawPowerUp(p){
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot * 0.3); // ligera rotación
  const pulse = 0.85 + 0.15 * Math.sin(performance.now()/150);

  if(p.type === 'shield'){
    // aura cyan
    const aura = ctx.createRadialGradient(0,0,6,0,0,32);
    aura.addColorStop(0, 'rgba(0,220,255,0.5)');
    aura.addColorStop(0.6, 'rgba(0,160,255,0.18)');
    aura.addColorStop(1, 'rgba(0,100,255,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0,0,32*pulse,0,Math.PI*2); ctx.fill();
    // círculo base
    ctx.fillStyle = 'rgba(0,40,60,0.7)';
    ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#00e8ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.stroke();
    // imagen Toretto
    if(powerToretto.complete && powerToretto.naturalWidth){
      ctx.save();
      ctx.beginPath(); ctx.arc(0,0,19,0,Math.PI*2); ctx.clip();
      const iw = 28, ih = 48;
      ctx.drawImage(powerToretto, -iw/2, -ih/2+2, iw, ih);
      ctx.restore();
    } else {
      ctx.fillStyle = '#00e8ff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡', 0, 6);
    }
  } else if(p.type === 'ghost'){
    // GHOST - invisibilidad (morado / fantasma)
    const aura = ctx.createRadialGradient(0,0,6,0,0,32);
    aura.addColorStop(0, 'rgba(180,80,255,0.5)');
    aura.addColorStop(0.6, 'rgba(120,40,200,0.18)');
    aura.addColorStop(1, 'rgba(80,0,160,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0,0,32*pulse,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(40,10,60,0.75)';
    ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#c060ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#e0b0ff';
    ctx.beginPath();
    ctx.arc(0, -4, 10, Math.PI, 0);
    ctx.lineTo(10, 10);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 10);
    ctx.lineTo(-5, 6);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a1040';
    ctx.beginPath(); ctx.arc(-3.5, -5, 2.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5, -5, 2.2, 0, Math.PI*2); ctx.fill();
  } else if(p.type === 'ramp'){
    // RAMP - rampa naranja
    const aura = ctx.createRadialGradient(0,0,6,0,0,32);
    aura.addColorStop(0, 'rgba(255,160,40,0.55)');
    aura.addColorStop(0.6, 'rgba(220,100,20,0.2)');
    aura.addColorStop(1, 'rgba(160,60,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0,0,32*pulse,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(50,25,5,0.8)';
    ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffaa30';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#ffb040';
    ctx.beginPath();
    ctx.moveTo(-12, 10);
    ctx.lineTo(12, 10);
    ctx.lineTo(12, 4);
    ctx.lineTo(-4, -10);
    ctx.lineTo(-12, -10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffe090';
    ctx.fillRect(-10, 6, 20, 3);
  } else {
    // GUNS - armas laterales (rojo/dorado)
    const aura = ctx.createRadialGradient(0,0,6,0,0,32);
    aura.addColorStop(0, 'rgba(255,60,60,0.55)');
    aura.addColorStop(0.6, 'rgba(200,40,40,0.2)');
    aura.addColorStop(1, 'rgba(120,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0,0,32*pulse,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(40,10,10,0.8)';
    ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ff5050';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.stroke();
    // dos cañones
    ctx.fillStyle = '#c0c4c8';
    ctx.fillRect(-14, -8, 6, 16);
    ctx.fillRect(8, -8, 6, 16);
    ctx.fillStyle = '#ffcc40';
    ctx.fillRect(-14, -10, 6, 4);
    ctx.fillRect(8, -10, 6, 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔫', 0, 18);
  }
  ctx.restore();
}

function getPowerInterval(){
  // Más frecuentes al inicio para notar power-ups (incl. armas)
  if(score < 100) return 5 + score * 0.02;  // ~5–7 s
  return Math.min(28, 8 + (score - 100) / 50);
}

/* ===== METEOROS (clásico, desde 900 pts) ===== */
let meteors=[], meteorTimer=0;
function resetMeteors(){ meteors=[]; meteorTimer=2.5; }
function playTireScreech(){
  try{
    if(sfxMuted) return;
    resumeAudio(); const t=actx.currentTime;
    // rechinido de llantas ~3.5s
    const n=actx.createBufferSource(); n.buffer=createNoiseBuffer(3.8);
    const nf=actx.createBiquadFilter(); nf.type='bandpass';
    nf.frequency.setValueAtTime(1800,t); nf.frequency.linearRampToValueAtTime(900,t+3.5); nf.Q.value=2.5;
    const ng=actx.createGain(); ng.gain.setValueAtTime(0.001,t);
    ng.gain.linearRampToValueAtTime(0.22,t+0.15);
    ng.gain.setValueAtTime(0.2,t+2.8);
    ng.gain.exponentialRampToValueAtTime(0.001,t+3.7);
    n.connect(nf); nf.connect(ng); ng.connect(sfxGain||masterGain); n.start(t); n.stop(t+3.8);
    // tono agudo de derrape
    const o=actx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(420,t); o.frequency.linearRampToValueAtTime(280,t+3.2);
    const g=actx.createGain(); g.gain.setValueAtTime(0.001,t);
    g.gain.linearRampToValueAtTime(0.06,t+0.2);
    g.gain.exponentialRampToValueAtTime(0.001,t+3.5);
    const f=actx.createBiquadFilter(); f.type='highpass'; f.frequency.value=200;
    o.connect(f); f.connect(g); g.connect(sfxGain||masterGain); o.start(t); o.stop(t+3.6);
  }catch(e){}
}
function playMeteorGround(){
  try{
    if(sfxMuted) return;
    resumeAudio(); const t=actx.currentTime;
    const n=actx.createBufferSource(); n.buffer=createNoiseBuffer(0.55);
    const nf=actx.createBiquadFilter(); nf.type='lowpass'; nf.frequency.setValueAtTime(600,t); nf.frequency.exponentialRampToValueAtTime(80,t+0.4);
    const ng=actx.createGain(); ng.gain.setValueAtTime(0.55,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.5);
    n.connect(nf); nf.connect(ng); ng.connect(masterGain); n.start(t); n.stop(t+0.55);
    const o=actx.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(70,t); o.frequency.exponentialRampToValueAtTime(28,t+0.35);
    const g=actx.createGain(); g.gain.setValueAtTime(0.45,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.4);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t+0.42);
  }catch(e){}
}
function playMeteorExplosion(){
  try{
    if(sfxMuted) return;
    resumeAudio(); const t=actx.currentTime;
    playMeteorGround();
    // boom más fuerte
    const n=actx.createBufferSource(); n.buffer=createNoiseBuffer(0.85);
    const nf=actx.createBiquadFilter(); nf.type='bandpass';
    nf.frequency.setValueAtTime(1100,t); nf.frequency.exponentialRampToValueAtTime(180,t+0.4); nf.Q.value=0.55;
    const ng=actx.createGain(); ng.gain.setValueAtTime(1.25,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.7);
    n.connect(nf); nf.connect(ng); ng.connect(masterGain); n.start(t); n.stop(t+0.75);
    const o=actx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(220,t); o.frequency.exponentialRampToValueAtTime(35,t+0.45);
    const g=actx.createGain(); g.gain.setValueAtTime(0.95,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.5);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t+0.52);
    // sub-boom grave
    const o2=actx.createOscillator(); o2.type='sine';
    o2.frequency.setValueAtTime(55,t); o2.frequency.exponentialRampToValueAtTime(22,t+0.5);
    const g2=actx.createGain(); g2.gain.setValueAtTime(1.0,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.55);
    o2.connect(g2); g2.connect(masterGain); o2.start(t); o2.stop(t+0.58);
  }catch(e){}
}
/** Meteoros: activos meteorOn pts (más difíciles al final), pausa meteorOff, ciclo. */
function getMeteorIntensity(){
  if(gameMode !== 'classic') return 0;
  const c = WEATHER_CYCLE;
  return cycleWave(score, c.meteorStart, c.meteorOn, c.meteorOff);
}
function getMeteorInterval(){
  const inten = getMeteorIntensity();
  if(inten <= 0) return 99;
  // más intensidad → más frecuentes (≈5s → ≈1.4s)
  const base = Math.max(1.3, 5.2 - inten * 3.6);
  return base + Math.random() * Math.max(0.5, 1.8 - inten * 1.2);
}
function getMeteorMaxActive(){
  const inten = getMeteorIntensity();
  if(inten <= 0) return 0;
  return Math.min(6, 1 + Math.floor(inten * 5));
}
function spawnMeteor(){
  const x = ROAD_LEFT + 30 + Math.random() * Math.max(40, ROAD_RIGHT - ROAD_LEFT - 60);
  const y = 80 + Math.random() * Math.max(60, PLAYER_Y - 50);
  meteors.push({
    x, y,
    warn: 3.0,
    fall: 0,
    falling: false,
    done: false,
    r: 22 + Math.random()*10,
    trail: []
  });
}
function updateMeteors(dt){
  if(gameMode !== 'classic' || !running) return;
  const inten = getMeteorIntensity();
  if(inten > 0){
    meteorTimer -= dt;
    if(meteorTimer <= 0 && meteors.filter(m=>!m.done).length < getMeteorMaxActive()){
      spawnMeteor();
      meteorTimer = getMeteorInterval();
    }
  } else {
    // ventana OFF: cancelar avisos que aún no caen
    meteors = meteors.filter(m => m.falling || m.done);
  }
  for(const m of meteors){
    if(m.done){ m.fall += dt; continue; }
    if(!m.falling){
      m.warn -= dt;
      if(m.warn <= 0){
        m.falling = true;
        m.fall = 0;
        m.trail = [];
      }
    } else {
      m.fall += dt;
      // posición del meteoro en caída para la estela
      const t = Math.min(1, m.fall / 0.45);
      const my = m.y - (1-t) * 200;
      m.trail.push({x:m.x+(Math.random()-0.5)*4, y:my, life:0.45, max:0.45, size:8+Math.random()*10, fire:Math.random()>0.35});
      if(m.trail.length > 28) m.trail.shift();
      for(const p of m.trail){ p.life -= dt; p.size += 18*dt; }
      m.trail = m.trail.filter(p=>p.life>0);
      // partículas de fuego/humo sueltas
      if(Math.random()<0.7){
        particles.push({
          x:m.x+(Math.random()-0.5)*12, y:my+(Math.random()-0.5)*8,
          vx:(Math.random()-0.5)*40, vy:-20-Math.random()*50,
          life:0.35+Math.random()*0.35, max:0.35+Math.random()*0.35,
          size:5+Math.random()*10,
          color: Math.random()>0.4 ? '#ff6020' : '#555',
          smoke: Math.random()>0.45, rot:0, vr:0
        });
      }
      if(m.fall >= 0.45 && !m._hit){
        m._hit = true;
        m.done = true;
        impactMeteor(m);
      }
    }
  }
  meteors = meteors.filter(m => !(m.done && m.fall > 1.4));
}
function impactMeteor(m){
  shake = Math.max(shake, 16);
  // explosión visual mejorada
  spawnCrashParticles(m.x, m.y, 36);
  for(let i=0;i<18;i++){
    const ang=Math.random()*Math.PI*2, spd=80+Math.random()*200;
    particles.push({
      x:m.x, y:m.y,
      vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd-60,
      life:0.7+Math.random()*0.6, max:0.7+Math.random()*0.6,
      size:5+Math.random()*12, color:['#ff4010','#ff8020','#ffcc40','#ff2200','#fff0a0'][i%5],
      rot:0, vr:0
    });
  }
  for(let i=0;i<14;i++){
    particles.push({
      x:m.x+(Math.random()-0.5)*30, y:m.y+(Math.random()-0.5)*20,
      vx:(Math.random()-0.5)*50, vy:-30-Math.random()*80,
      life:0.9+Math.random()*0.8, max:0.9+Math.random()*0.8,
      size:14+Math.random()*22, color:'#3a3028', smoke:true, rot:0, vr:0
    });
  }
  // anillo de choque (partículas en círculo)
  for(let i=0;i<16;i++){
    const ang = (i/16)*Math.PI*2;
    particles.push({
      x:m.x, y:m.y,
      vx:Math.cos(ang)*160, vy:Math.sin(ang)*160,
      life:0.4+Math.random()*0.25, max:0.4+Math.random()*0.25,
      size:3+Math.random()*5, color:'#ffaa60', rot:0, vr:0
    });
  }
  let hitVehicle = false;
  if(Math.abs(m.x - playerX) < m.r + 28 && Math.abs(m.y - PLAYER_Y) < m.r + 40){
    playMeteorExplosion();
    triggerCrash({x:m.x,y:m.y,w:20,h:20,crashed:true,crashVx:0,crashVy:0,crashSpin:0,crashAngle:0,scale:1});
    return;
  }
  for(const car of traffic){
    if(car.crashed) continue;
    if(Math.abs(m.x - car.x) < m.r + car.w*0.4 && Math.abs(m.y - car.y) < m.r + car.h*0.4){
      hitVehicle = true;
      car.crashed = true;
      car.crashVx = (Math.random()-0.5)*220;
      car.crashVy = -180 - Math.random()*120;
      car.crashSpin = (Math.random()-0.5)*14;
      car.crashAngle = 0;
      car.scale = 1;
      spawnCrashParticles(car.x, car.y, 32);
      score += 20;
    }
  }
  if(hitVehicle) playMeteorExplosion();
  else playMeteorGround();
}
function drawMeteors(){
  if(gameMode !== 'classic') return;
  for(const m of meteors){
    if(m.done){
      const a = Math.max(0, 1.2 - m.fall);
      // flash + onda expansiva
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, a*0.4);
      const rg = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, m.r*(2+m.fall*3));
      rg.addColorStop(0, 'rgba(255,200,80,0.9)');
      rg.addColorStop(0.35, 'rgba(255,80,20,0.45)');
      rg.addColorStop(1, 'rgba(80,20,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r*(2+m.fall*3), 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = Math.min(0.7, a*0.55);
      ctx.strokeStyle = '#ffaa40';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r*(1.2+m.fall*4), 0, Math.PI*2); ctx.stroke();
      ctx.restore();
      continue;
    }
    if(!m.falling){
      const pulse = 0.35 + 0.35 * Math.sin(performance.now()/120);
      const warnProg = 1 - m.warn/3;
      const rr = m.r * (0.8 + warnProg * 0.5);
      ctx.save();
      ctx.globalAlpha = 0.25 + pulse * 0.35 + warnProg * 0.2;
      const g = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, rr*2.2);
      g.addColorStop(0, 'rgba(255,40,0,0.85)');
      g.addColorStop(0.5, 'rgba(200,20,0,0.35)');
      g.addColorStop(1, 'rgba(120,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(m.x, m.y, rr*2.2, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = `rgba(255,80,40,${0.5+pulse*0.4})`;
      ctx.lineWidth = 2 + warnProg * 2;
      ctx.beginPath(); ctx.arc(m.x, m.y, rr, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ffccaa';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(m.warn)+'s', m.x, m.y - rr - 8);
      ctx.restore();
    } else {
      const t = Math.min(1, m.fall / 0.45);
      const my = m.y - (1-t) * 200;
      const sc = 0.45 + t * 0.75;
      // estela de fuego y humo
      if(m.trail){
        for(let i=0;i<m.trail.length;i++){
          const p=m.trail[i];
          const a=Math.max(0,p.life/p.max);
          ctx.globalAlpha = a * (p.fire ? 0.55 : 0.28);
          ctx.fillStyle = p.fire ? (i%2? '#ff8020':'#ffcc40') : '#3a3838';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(p.fire?0.55:0.7), 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // estela alargada detrás
      ctx.save();
      ctx.translate(m.x, my);
      ctx.globalAlpha = 0.65;
      const trailG = ctx.createLinearGradient(0, -70, 0, 8);
      trailG.addColorStop(0, 'rgba(255,220,100,0)');
      trailG.addColorStop(0.4, 'rgba(255,120,20,0.55)');
      trailG.addColorStop(1, 'rgba(255,40,0,0.9)');
      ctx.fillStyle = trailG;
      ctx.beginPath();
      ctx.moveTo(-10*sc, -70); ctx.lineTo(10*sc, -70);
      ctx.lineTo(6*sc, 6); ctx.lineTo(-6*sc, 6);
      ctx.closePath(); ctx.fill();
      // núcleo del meteoro
      ctx.globalAlpha = 1;
      ctx.scale(sc, sc);
      const core = ctx.createRadialGradient(-3, -4, 2, 0, 0, m.r*0.85);
      core.addColorStop(0, '#fff0a0');
      core.addColorStop(0.35, '#ff8020');
      core.addColorStop(0.7, '#8a4030');
      core.addColorStop(1, '#2a1810');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, m.r*0.75, 0, Math.PI*2); ctx.fill();
      // grietas
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(4, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, -6); ctx.lineTo(-2, 5); ctx.stroke();
      ctx.restore();
      // sombra en suelo
      ctx.fillStyle = `rgba(0,0,0,${0.2+t*0.4})`;
      ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r*(0.5+t*0.55), m.r*0.22*(0.5+t*0.55), 0, 0, Math.PI*2); ctx.fill();
    }
  }
}

/** Intensidad cíclica: ON durante onPts (0→1), OFF durante offPts. */
function cycleWave(score, startAt, onPts, offPts){
  if(score < startAt) return 0;
  const cycle = onPts + offPts;
  const t = (score - startAt) % cycle;
  if(t >= onPts) return 0;
  // rampa de dificultad dentro de la ventana ON (0 → 1)
  return Math.min(1, t / (onPts * 0.85));
}

function getApoc(){
  // terremoto ligado al tramo fuerte de la tormenta (opcional, ciclo corto)
  if(gameMode !== 'classic') return 0;
  const s = getStorm();
  // temblor solo cuando la tormenta está intensa
  return s > 0.55 ? (s - 0.55) / 0.45 : 0;
}

// Lluvia/tormenta: activa stormOn pts, pausa stormOff, ciclo
function getStorm(){
  if(gameMode !== 'classic') return 0;
  const c = WEATHER_CYCLE;
  return cycleWave(score, c.stormStart, c.stormOn, c.stormOff);
}
function updateRoadGeometry(){
  const apoc = getApoc();
  const storm = getStorm();
  const baseL = Math.floor(W * 0.20);
  const baseR = Math.floor(W * 0.80);
  // 200+: estrechamiento suave; 500+: se suma el del apocalipsis
  const shrink = storm * W * 0.035 + apoc * W * 0.09;
  ROAD_LEFT = Math.floor(baseL + shrink);
  ROAD_RIGHT = Math.floor(baseR - shrink);
  ROAD_INNER_L = ROAD_LEFT + 10;
  ROAD_INNER_R = ROAD_RIGHT - 10;
  const roadW = ROAD_RIGHT - ROAD_LEFT;
  lanes = [
    ROAD_LEFT + roadW * 0.20,
    ROAD_LEFT + roadW * 0.50,
    ROAD_LEFT + roadW * 0.80
  ];
  if(typeof lane === 'number' && running){
    playerTargetX = lanes[lane];
  }
}

/* ===== Lluvia ácida + relámpagos (desde 200 pts) ===== */
let rainDrops=[], lightningTimer=0, lightningFlash=0, lightningBolts=[];
function initRain(){
  rainDrops=[];
  const n = LANDSCAPE ? 40 : 28;
  for(let i=0;i<n;i++){
    rainDrops.push({
      x: Math.random()*W,
      y: Math.random()*H,
      len: 10 + Math.random()*14,
      spd: 380 + Math.random()*280,
      thick: 1 + Math.random()*1.2,
      drift: -40 - Math.random()*50
    });
  }
}
function updateStorm(dt){
  const storm = getStorm();
  if(storm <= 0){
    rainDrops = [];
    lightningFlash = 0;
    lightningBolts = [];
    return;
  }
  if(rainDrops.length === 0) initRain();
  // más gotas si la intensidad sube (tope bajo para rendimiento)
  const target = Math.floor((LANDSCAPE ? 36 : 26) + storm * (LANDSCAPE ? 28 : 20));
  while(rainDrops.length < target){
    rainDrops.push({
      x: Math.random()*W, y: -20 - Math.random()*H*0.3,
      len: 10 + Math.random()*14, spd: 380 + Math.random()*280,
      thick: 1 + Math.random()*1.2, drift: -40 - Math.random()*50
    });
  }
  for(const d of rainDrops){
    d.y += d.spd * dt * (0.85 + storm * 0.4);
    d.x += d.drift * dt;
    if(d.y > H + 20 || d.x < -30){
      d.y = -10 - Math.random()*40;
      d.x = Math.random() * (W + 40) - 10;
    }
  }
  // relámpagos
  lightningTimer -= dt;
  if(lightningFlash > 0) lightningFlash = Math.max(0, lightningFlash - dt * 3.2);
  if(lightningTimer <= 0){
    const wait = (2.2 - storm * 1.3) + Math.random() * (2.8 - storm * 1.2);
    lightningTimer = Math.max(0.55, wait);
    if(Math.random() < 0.35 + storm * 0.5){
      lightningFlash = 0.55 + Math.random() * 0.35;
      // generar rayo
      const bx = W * (0.15 + Math.random() * 0.7);
      const segs = [];
      let x = bx, y = -10;
      const steps = 6 + Math.floor(Math.random() * 5);
      for(let i=0;i<steps;i++){
        const nx = x + (Math.random() - 0.5) * 50;
        const ny = y + H / steps * (0.7 + Math.random() * 0.5);
        segs.push({x1:x,y1:y,x2:nx,y2:ny});
        // rama ocasional
        if(Math.random() < 0.35){
          segs.push({x1:x,y1:y,x2:x+(Math.random()-0.5)*70,y2:y+20+Math.random()*40, branch:true});
        }
        x = nx; y = ny;
      }
      lightningBolts = segs;
      // pequeño temblor con el trueno visual
      shake = Math.max(shake, 3 + storm * 4);
    }
  } else if(lightningFlash <= 0){
    lightningBolts = [];
  }
}
function drawStorm(){
  const storm = getStorm();
  if(storm <= 0) return;

  // lluvia en un solo path (mucho más barato)
  const a = 0.3 + storm * 0.4;
  ctx.strokeStyle = `rgba(160, 230, 90, ${a})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for(let i=0;i<rainDrops.length;i++){
    const d=rainDrops[i];
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.drift * 0.04, d.y + d.len);
  }
  ctx.stroke();

  // velo verdoso
  ctx.fillStyle = `rgba(40, 70, 20, ${0.06 + storm * 0.12})`;
  ctx.fillRect(0, 0, W, H);

  // flash + rayo sin shadowBlur
  if(lightningFlash > 0){
    const f = Math.min(1, lightningFlash * 1.6);
    ctx.fillStyle = `rgba(200, 255, 180, ${f * 0.22})`;
    ctx.fillRect(0, 0, W, H);
    if(lightningBolts.length){
      ctx.strokeStyle = `rgba(240, 255, 210, ${0.55 + f * 0.4})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for(let i=0;i<lightningBolts.length;i++){
        const s=lightningBolts[i];
        if(s.branch) continue;
        ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
      }
      ctx.stroke();
      ctx.strokeStyle = `rgba(180, 255, 160, ${0.35 + f * 0.3})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for(let i=0;i<lightningBolts.length;i++){
        const s=lightningBolts[i];
        if(!s.branch) continue;
        ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
      }
      ctx.stroke();
    }
  }
}
function updatePowerUps(dt){
  powerSpawn += dt;
  const interval = getPowerInterval();
  if(powerSpawn > interval && powerUps.length < 1 && !powerActive){
    spawnPowerUp();
    powerSpawn = 0;
  }
  for(const p of powerUps){
    p.y += (speed * 0.85) * dt;
    p.rot += dt * 2.5;
    if(!p.collected && Math.abs(p.x - playerX) < 42 && Math.abs(p.y - PLAYER_Y) < 58){
      p.collected = true;
      activatePower(p.type);
    }
  }
  powerUps = powerUps.filter(p => !p.collected && p.y < H+80);

  if(powerActive){
    powerTimer -= dt;
    if(powerTimer <= 0){
      powerActive = false;
      powerType = null;
      powerTimer = 0;
      gunBullets = [];
      gunFireTimer = 0;
    } else if(powerType === 'guns'){
      updateGunWeapons(dt);
    }
  } else {
    // las balas en vuelo siguen un momento tras acabar el power
    if(gunBullets.length) updateGunWeapons(dt);
  }
}

function powerDuration(type){
  if(type==='shield') return POWER_SHIELD_DUR;
  if(type==='ghost') return POWER_GHOST_DUR;
  if(type==='guns') return POWER_GUNS_DUR;
  return POWER_RAMP_DUR;
}
function activatePower(type){
  powerActive = true;
  powerType = type;
  powerTimer = powerDuration(type);
  if(type === 'guns'){
    gunFireTimer = 0; // dispara en cuanto se activa (primera salva al instante)
    gunBullets = [];
  }
  spawnCrashParticles(playerX, PLAYER_Y-30, 22);
  try{
    if(actx){
      const t = actx.currentTime;
      const osc = actx.createOscillator();
      osc.type = 'sine';
      if(type === 'shield'){
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(880, t+0.15);
        osc.frequency.exponentialRampToValueAtTime(1200, t+0.3);
      } else if(type === 'ghost'){
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(200, t+0.2);
        osc.frequency.exponentialRampToValueAtTime(600, t+0.35);
      } else if(type === 'guns'){
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(440, t+0.1);
        osc.frequency.exponentialRampToValueAtTime(110, t+0.28);
      } else {
        // rampa: tono ascendente potente
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(480, t+0.12);
        osc.frequency.exponentialRampToValueAtTime(900, t+0.28);
      }
      const g = actx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.4);
      osc.connect(g); g.connect(masterGain);
      osc.start(t); osc.stop(t+0.45);
    }
  }catch(e){}
}


/* ===== HABILIDAD ARMAS LATERALES ===== */
function fireGunSalvo(){
  let target = null;
  let bestDist = Infinity;
  for(const car of traffic){
    if(car.crashed) continue;
    if(car.y >= PLAYER_Y - 20) continue;
    const dy = PLAYER_Y - car.y;
    const dx = car.x - playerX;
    const dist = dy * dy + dx * dx * 0.35;
    if(dist < bestDist){ bestDist = dist; target = car; }
  }
  const side = LANDSCAPE ? 34 : 38;
  const yOff = LANDSCAPE ? -50 : -58;
  const spd = 580;
  for(const dir of [-1, 1]){
    const sx = playerX + dir * side;
    const sy = PLAYER_Y + yOff;
    let vx, vy;
    if(target){
      const dx = target.x - sx, dy = target.y - sy;
      const len = Math.sqrt(dx*dx+dy*dy)||1;
      vx = (dx/len)*spd; vy = (dy/len)*spd;
    } else {
      vx = 0; vy = -spd;
    }
    gunBullets.push({ x:sx, y:sy, vx, vy, r:6, life:2.8, target });
  }
  try{ playGunshot(); }catch(e){}
  shake = Math.max(shake, 3);
}

function updateGunWeapons(dt){
  if(powerActive && powerType === 'guns'){
    gunFireTimer -= dt;
    if(gunFireTimer <= 0){
      fireGunSalvo();
      gunFireTimer = GUN_FIRE_INTERVAL;
    }
  }
  for(const b of gunBullets){
    if(b.target && !b.target.crashed && b.target.y < PLAYER_Y){
      const dx = b.target.x - b.x, dy = b.target.y - b.y;
      const len = Math.sqrt(dx*dx+dy*dy)||1;
      const home = 320 * dt;
      b.vx += (dx/len)*home; b.vy += (dy/len)*home;
      const sp = Math.sqrt(b.vx*b.vx+b.vy*b.vy)||1;
      if(sp > 620){ b.vx = (b.vx/sp)*620; b.vy = (b.vy/sp)*620; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for(const car of traffic){
      if(car.crashed) continue;
      const hw = (car.w||56)*0.55, hh = (car.h||100)*0.55;
      if(Math.abs(b.x-car.x)<hw && Math.abs(b.y-car.y)<hh){
        b.life = -1; explodeTrafficCar(car); break;
      }
    }
  }
  gunBullets = gunBullets.filter(b => b.life > 0 && b.y > -50 && b.y < H + 50);
}

function explodeTrafficCar(car){
  car.crashed = true;
  car.rampLaunch = false;
  const dir = (car.x >= playerX ? 1 : -1) || (Math.random() < 0.5 ? 1 : -1);
  car.crashVx = dir * (80 + Math.random() * 100);
  car.crashVy = -180 - Math.random() * 120;
  car.crashSpin = dir * (6 + Math.random() * 5);
  car.crashAngle = 0;
  car.scale = 1;
  spawnCrashParticles(car.x, car.y, 36);
  shake = Math.max(shake, 10);
  score += 20;
  try{ playCrash(); }catch(e){}
}

function drawGunBullets(){
  for(const b of gunBullets){
    ctx.save();
    // estela
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffaa40';
    ctx.beginPath(); ctx.arc(b.x, b.y + 10, b.r * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffe060';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y - 1.5, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawPlayerGuns(){
  if(!powerActive || powerType !== 'guns') return;
  const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 90);
  const lean = Math.max(-0.18, Math.min(0.18, (playerTargetX - playerX) * 0.004));
  ctx.save();
  ctx.translate(playerX, PLAYER_Y);
  ctx.rotate(lean);
  const side = LANDSCAPE ? 30 : 34;
  const baseY = LANDSCAPE ? -8 : -10;
  for(const dir of [-1, 1]){
    const x = dir * side;
    // soporte
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(x - 4, baseY - 6, 8, 18);
    // cañón
    const g = ctx.createLinearGradient(x - 5, 0, x + 5, 0);
    g.addColorStop(0, '#606870');
    g.addColorStop(0.5, '#d0d4d8');
    g.addColorStop(1, '#606870');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x - 5, baseY - 42, 10, 40, 3);
    ctx.fill();
    // boca del cañón
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 4, baseY - 44, 8, 5);
    // brillo / calor
    ctx.globalAlpha = 0.4 * pulse;
    ctx.fillStyle = '#ff6020';
    ctx.beginPath(); ctx.arc(x, baseY - 44, 4 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawPowerHUD(){
  if(!powerActive) return;
  const t = performance.now();
  const isShield = powerType === 'shield';
  const isGhost = powerType === 'ghost';
  const isRamp = powerType === 'ramp';
  const isGuns = powerType === 'guns';
  const dur = powerDuration(powerType);
  const beatSpeed = powerTimer < 2.5 ? 180 : 320;
  const beat = 0.55 + 0.45 * Math.abs(Math.sin(t / beatSpeed * Math.PI));
  const urgent = powerTimer < 2.5;

  // borde de pantalla con palpito fuerte (como antes)
  const borderAlpha = urgent ? (0.35 + 0.55 * beat) : (0.2 + 0.35 * beat);
  ctx.save();
  ctx.globalAlpha = borderAlpha;
  ctx.strokeStyle = urgent ? '#ff4466' : (isShield ? '#00e8ff' : (isGhost ? '#c060ff' : (isGuns ? '#ff5050' : '#ffaa30')));
  ctx.lineWidth = 4 + beat * 3;
  ctx.shadowColor = urgent ? '#ff2040' : (isShield ? '#00c8ff' : (isGhost ? '#a040ff' : (isGuns ? '#ff2020' : '#ff8800')));
  ctx.shadowBlur = 12 + beat * 10;
  ctx.beginPath();
  ctx.roundRect(3, 3, W-6, H-6, 10);
  ctx.stroke();
  ctx.globalAlpha = borderAlpha * 0.45;
  ctx.lineWidth = 2;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.roundRect(8, 8, W-16, H-16, 8);
  ctx.stroke();
  ctx.restore();

  // barra con palpito
  const barW = 130, barH = 11;
  const x = W/2 - barW/2, y = 14;
  const pct = Math.max(0, powerTimer / dur);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.roundRect(x-3, y-3, barW+6, barH+6, 6); ctx.fill();
  ctx.fillStyle = '#0a3040';
  ctx.beginPath(); ctx.roundRect(x, y, barW, barH, 4); ctx.fill();
  const grd = ctx.createLinearGradient(x,0,x+barW,0);
  if(urgent){
    grd.addColorStop(0, '#ff6080'); grd.addColorStop(1, '#ff2040');
  } else if(isShield){
    grd.addColorStop(0, '#00e8ff'); grd.addColorStop(1, '#0088ff');
  } else if(isGhost){
    grd.addColorStop(0, '#e080ff'); grd.addColorStop(1, '#8040ff');
  } else if(isGuns){
    grd.addColorStop(0, '#ff8080'); grd.addColorStop(1, '#ff2020');
  } else {
    grd.addColorStop(0, '#ffcc40'); grd.addColorStop(1, '#ff6600');
  }
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.roundRect(x, y, Math.max(2, barW * pct), barH, 4); ctx.fill();

  // texto con palpito
  ctx.save();
  const scale = 0.92 + 0.12 * beat;
  ctx.translate(W/2, y + barH + 16);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 0.65 + 0.35 * beat;
  ctx.fillStyle = urgent ? '#ff6688' : (isShield ? '#a0f0ff' : (isGhost ? '#e0b0ff' : (isGuns ? '#ffb0b0' : '#ffd080')));
  ctx.shadowColor = urgent ? '#ff2040' : (isShield ? '#00e8ff' : (isGhost ? '#c060ff' : (isGuns ? '#ff3030' : '#ff8800')));
  ctx.shadowBlur = 8 + beat * 12;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  const label = isShield
    ? ('⚡ ESCUDO ' + powerTimer.toFixed(1) + 's')
    : (isGhost
      ? ('👻 FANTASMA ' + powerTimer.toFixed(1) + 's')
      : (isGuns
        ? ('🔫 ARMAS ' + powerTimer.toFixed(1) + 's')
        : ('🚀 RAMPA ' + powerTimer.toFixed(1) + 's')));
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

function drawPlayerRamp(){
  if(!powerActive || powerType !== 'ramp') return;
  const pulse = 0.85 + 0.15 * Math.sin(performance.now()/100);
  const lean = Math.max(-0.18, Math.min(0.18, (playerTargetX - playerX) * 0.004));
  ctx.save();
  ctx.translate(playerX, PLAYER_Y);
  ctx.rotate(lean);
  // rampa metálica pegada al capó (hacia arriba = frente)
  const rw = LANDSCAPE ? 52 : 58;
  const rh = LANDSCAPE ? 38 : 44;
  const baseY = LANDSCAPE ? -58 : -68;
  // sombra / base
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.moveTo(-rw*0.45, baseY + 8);
  ctx.lineTo(rw*0.45, baseY + 8);
  ctx.lineTo(rw*0.38, baseY - rh*0.15);
  ctx.lineTo(-rw*0.15, baseY - rh);
  ctx.lineTo(-rw*0.45, baseY - rh*0.55);
  ctx.closePath();
  ctx.fill();
  // placa principal naranja
  const g = ctx.createLinearGradient(-rw*0.4, baseY, rw*0.2, baseY - rh);
  g.addColorStop(0, '#c87820');
  g.addColorStop(0.4, '#ffaa30');
  g.addColorStop(1, '#ffe080');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-rw*0.42, baseY + 4);
  ctx.lineTo(rw*0.42, baseY + 4);
  ctx.lineTo(rw*0.36, baseY - rh*0.12);
  ctx.lineTo(-rw*0.12, baseY - rh);
  ctx.lineTo(-rw*0.42, baseY - rh*0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ff6600';
  ctx.lineWidth = 2;
  ctx.stroke();
  // ranuras
  ctx.strokeStyle = 'rgba(80,30,0,0.35)';
  ctx.lineWidth = 1.5;
  for(let i=0;i<4;i++){
    const t = (i+1)/5;
    const y1 = baseY + 2 - t * rh * 0.85;
    const xL = -rw*0.38 + t*rw*0.12;
    const xR = rw*0.38 - t*rw*0.35;
    ctx.beginPath(); ctx.moveTo(xL, y1); ctx.lineTo(xR, y1); ctx.stroke();
  }
  // brillo animado
  ctx.globalAlpha = 0.35 * pulse;
  ctx.fillStyle = '#fff8c0';
  ctx.beginPath();
  ctx.moveTo(-rw*0.2, baseY - 2);
  ctx.lineTo(rw*0.1, baseY - 2);
  ctx.lineTo(-rw*0.05, baseY - rh*0.55);
  ctx.closePath();
  ctx.fill();
  // chispas en la punta
  ctx.globalAlpha = 0.5 + 0.5 * pulse;
  ctx.fillStyle = '#ffee80';
  ctx.beginPath(); ctx.arc(-rw*0.12, baseY - rh + 2, 3*pulse, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawPlayerShield(){
  if(!powerActive) return;
  if(powerType === 'ramp'){ drawPlayerRamp(); return; }
  if(powerType === 'guns'){ drawPlayerGuns(); return; }
  const pulse = 0.7 + Math.sin(performance.now()/120) * 0.3;
  ctx.save();
  if(powerType === 'shield'){
    ctx.globalAlpha = 0.25 * pulse;
    ctx.fillStyle = 'rgba(0,200,255,0.25)';
    ctx.beginPath(); ctx.arc(playerX, PLAYER_Y, 58, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.55 * pulse;
    ctx.strokeStyle = '#00e8ff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(playerX, PLAYER_Y, 55, 0, Math.PI*2); ctx.stroke();
  } else if(powerType === 'ghost'){
    ctx.globalAlpha = 0.22 * pulse;
    ctx.fillStyle = 'rgba(160,60,255,0.3)';
    ctx.beginPath(); ctx.arc(playerX, PLAYER_Y, 52, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.5 * pulse;
    ctx.strokeStyle = '#c060ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(playerX, PLAYER_Y, 50, 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}

function launchWithRamp(car){
  car.crashed = true;
  car.rampLaunch = true;
  car.rampT = 0;
  // inclinación hacia un lado y vuelo por encima del jugador
  const dir = (car.x >= playerX ? 1 : -1) || (Math.random()<0.5?1:-1);
  car.crashVx = dir * (40 + Math.random()*50);
  car.crashVy = -520 - Math.random()*120; // sube fuerte
  car.crashSpin = dir * (2.2 + Math.random()*1.2); // giro lateral sostenido
  car.crashAngle = dir * 0.35; // ya inclinado al despegar
  car.scale = 1;
  car.tiltZ = dir * 0.55; // inclinación extra visual
  spawnCrashParticles(car.x, car.y + 10, 20);
  for(let i=0;i<10;i++){
    const ang = -Math.PI/2 + (Math.random()-0.5)*1.4;
    const spd = 100 + Math.random()*180;
    particles.push({
      x:car.x+(Math.random()-0.5)*20, y:car.y,
      vx:Math.cos(ang)*spd + dir*30, vy:Math.sin(ang)*spd,
      life:0.45+Math.random()*0.4, max:0.45+Math.random()*0.4,
      size:3+Math.random()*5, color:['#ffaa30','#ffee80','#ff6600','#fff','#ffcc66'][i%5],
      rot:0, vr:0
    });
  }
  shake = Math.max(shake, 12);
  score += 15;
  try{
    if(actx){
      const t = actx.currentTime;
      const osc = actx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(35, t+0.28);
      const g = actx.createGain();
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.32);
      osc.connect(g); g.connect(masterGain);
      osc.start(t); osc.stop(t+0.35);
    }
  }catch(e){}
}

/* ===== MODO PERSECUCIÓN =====
   Estado en systems/chaseState.js (`chase`).
   Variables locales + pull/push para no reescribir todo el cuerpo aún.
*/
let gameMode = 'classic';

function resetChase() {
  resetChaseState();
  pullChaseState();
  try { stopSiren(); } catch (e) {}
}

let health, police, bullets, missiles, medkits;
let bulletTimer, missileTimer, medkitSpawn, bulletBurstLeft, bulletBurstGap;
let chaseIntroT, chaseIntroDone, chaseIntroProg;
let GOD_MODE;
let fightPhase, policeHP, policeMaxHP;
let playerAmmo, reloadTimer, playerBullets;
let fightBanner, policeLaneTimer, fightT;
let actionMusic, policeDyingT;
let fightRound, fightMedkitsSpawned, fightMissileStep, fightMissileWait;
let esmat, esmatHP, esmatMaxHP, esmatPhase, esmatT;
let esmatLaneTimer, esmatBulletTimer, esmatBurstLeft, esmatBurstGap;
let esmatWaterTimer, esmatWaterBlind, esmatMissileStep, esmatMissileWait, esmatMissileCycle;
let esmatRamTimer, esmatRamActive, esmatRamHitT, esmatFrontMode, esmatPosTimer, esmatDialogue;
let playerRamShield, playerRamShieldCD, playerRamHitT;
let phase3Medkits, phase3ScoreBase, phase3Apocalypse, thunderT, esmatBolts;

function pullChaseState() {
  const c = chase;
  health = c.health; police = c.police; bullets = c.bullets; missiles = c.missiles; medkits = c.medkits;
  bulletTimer = c.bulletTimer; missileTimer = c.missileTimer; medkitSpawn = c.medkitSpawn;
  bulletBurstLeft = c.bulletBurstLeft; bulletBurstGap = c.bulletBurstGap;
  chaseIntroT = c.chaseIntroT; chaseIntroDone = c.chaseIntroDone; chaseIntroProg = c.chaseIntroProg;
  GOD_MODE = c.godMode;
  fightPhase = c.fightPhase; policeHP = c.policeHP; policeMaxHP = c.policeMaxHP;
  playerAmmo = c.playerAmmo; reloadTimer = c.reloadTimer; playerBullets = c.playerBullets;
  fightBanner = c.fightBanner; policeLaneTimer = c.policeLaneTimer; fightT = c.fightT;
  actionMusic = c.actionMusic; policeDyingT = c.policeDyingT;
  fightRound = c.fightRound; fightMedkitsSpawned = c.fightMedkitsSpawned;
  fightMissileStep = c.fightMissileStep; fightMissileWait = c.fightMissileWait;
  esmat = c.esmat; esmatHP = c.esmatHP; esmatMaxHP = c.esmatMaxHP; esmatPhase = c.esmatPhase; esmatT = c.esmatT;
  esmatLaneTimer = c.esmatLaneTimer; esmatBulletTimer = c.esmatBulletTimer;
  esmatBurstLeft = c.esmatBurstLeft; esmatBurstGap = c.esmatBurstGap;
  esmatWaterTimer = c.esmatWaterTimer; esmatWaterBlind = c.esmatWaterBlind;
  esmatMissileStep = c.esmatMissileStep; esmatMissileWait = c.esmatMissileWait; esmatMissileCycle = c.esmatMissileCycle;
  esmatRamTimer = c.esmatRamTimer; esmatRamActive = c.esmatRamActive; esmatRamHitT = c.esmatRamHitT;
  esmatFrontMode = c.esmatFrontMode; esmatPosTimer = c.esmatPosTimer; esmatDialogue = c.esmatDialogue;
  playerRamShield = c.playerRamShield; playerRamShieldCD = c.playerRamShieldCD; playerRamHitT = c.playerRamHitT;
  phase3Medkits = c.phase3Medkits; phase3ScoreBase = c.phase3ScoreBase; phase3Apocalypse = c.phase3Apocalypse;
  thunderT = c.thunderT; esmatBolts = c.esmatBolts;
}

function pushChaseState() {
  const c = chase;
  c.health = health; c.police = police; c.bullets = bullets; c.missiles = missiles; c.medkits = medkits;
  c.bulletTimer = bulletTimer; c.missileTimer = missileTimer; c.medkitSpawn = medkitSpawn;
  c.bulletBurstLeft = bulletBurstLeft; c.bulletBurstGap = bulletBurstGap;
  c.chaseIntroT = chaseIntroT; c.chaseIntroDone = chaseIntroDone; c.chaseIntroProg = chaseIntroProg;
  c.godMode = GOD_MODE;
  c.fightPhase = fightPhase; c.policeHP = policeHP; c.policeMaxHP = policeMaxHP;
  c.playerAmmo = playerAmmo; c.reloadTimer = reloadTimer; c.playerBullets = playerBullets;
  c.fightBanner = fightBanner; c.policeLaneTimer = policeLaneTimer; c.fightT = fightT;
  c.actionMusic = actionMusic; c.policeDyingT = policeDyingT;
  c.fightRound = fightRound; c.fightMedkitsSpawned = fightMedkitsSpawned;
  c.fightMissileStep = fightMissileStep; c.fightMissileWait = fightMissileWait;
  c.esmat = esmat; c.esmatHP = esmatHP; c.esmatMaxHP = esmatMaxHP; c.esmatPhase = esmatPhase; c.esmatT = esmatT;
  c.esmatLaneTimer = esmatLaneTimer; c.esmatBulletTimer = esmatBulletTimer;
  c.esmatBurstLeft = esmatBurstLeft; c.esmatBurstGap = esmatBurstGap;
  c.esmatWaterTimer = esmatWaterTimer; c.esmatWaterBlind = esmatWaterBlind;
  c.esmatMissileStep = esmatMissileStep; c.esmatMissileWait = esmatMissileWait; c.esmatMissileCycle = esmatMissileCycle;
  c.esmatRamTimer = esmatRamTimer; c.esmatRamActive = esmatRamActive; c.esmatRamHitT = esmatRamHitT;
  c.esmatFrontMode = esmatFrontMode; c.esmatPosTimer = esmatPosTimer; c.esmatDialogue = esmatDialogue;
  c.playerRamShield = playerRamShield; c.playerRamShieldCD = playerRamShieldCD; c.playerRamHitT = playerRamHitT;
  c.phase3Medkits = phase3Medkits; c.phase3ScoreBase = phase3ScoreBase; c.phase3Apocalypse = phase3Apocalypse;
  c.thunderT = thunderT; c.esmatBolts = esmatBolts;
}

// Inicializar aliases desde el estado central
pullChaseState();

function setFightBanner(text, dur){
  fightBanner={text, t:dur||2.5, max:dur||2.5};
}
function startActionMusic(){
  actionMusic=true;
  try{ stopMusic(); startMusic(); }catch(e){}
}
function stopActionMusic(){
  actionMusic=false;
  try{ stopMusic(); startMusic(); }catch(e){}
}
function playerShoot(){
  if(gameMode!=='chase' || !running || paused) return;
  pullChaseState();
  const canShoot = (fightPhase==='fight') || (esmatPhase==='fight');
  if(!canShoot) return;
  if(reloadTimer>0) return;
  const reloadDur = (fightRound===3 || esmatPhase==='fight') ? 14 : 15;
  if(playerAmmo<=0){ reloadTimer=reloadDur; pushChaseState(); return; }
  playerAmmo--;
  playerBullets.push({
    x:playerX+(Math.random()-0.5)*6,
    y:PLAYER_Y - 40,
    vx:(Math.random()-0.5)*20,
    vy:-420 - Math.random()*40,
    r:3.5, life:2.2
  });
  playGunshot();
  if(playerAmmo<=0) reloadTimer=reloadDur;
  pushChaseState();
}

function getChaseTargets(){
  const pH = LANDSCAPE ? 100 : 115;
  const polH = LANDSCAPE ? 140 : 155;
  const gap = 210;
  // jugador más abajo → más espacio arriba para reaccionar al tráfico
  let py = Math.floor(H * (LANDSCAPE ? 0.50 : 0.55));
  let poly = py + gap;
  if(poly + polH/2 > H - 4){
    poly = H - 4 - polH/2;
    py = poly - gap;
  }
  if(py - pH/2 < 50) py = 50 + pH/2;
  return {polH, polW: LANDSCAPE?78:88, poly: Math.floor(poly), py: Math.floor(py), pH};
}
function applyChaseCamera(){
  const cam = getChaseTargets();
  if(chaseIntroDone) PLAYER_Y = cam.py;
  return cam;
}
function initPolice(kind){
  const cam = getChaseTargets();
  const isVan = kind==='van';
  police={
    x:playerX, y: H + (isVan?cam.polH:cam.polH)/2 + 30,
    targetY: cam.poly,
    w: isVan ? (LANDSCAPE?86:96) : cam.polW,
    h: isVan ? (LANDSCAPE?155:170) : cam.polH,
    lane:lane, targetX:playerX,
    kind: isVan ? 'van' : 'pickup',
    phase2: !!isVan,
    missileWave: 0
  };
}
function drawPoliceCar(){
  if(!police) return;
  ctx.save();
  ctx.translate(police.x, police.y);
  if(police.driftLean) ctx.rotate(police.driftLean);
  const pImg = (police.kind==='van') ? policeVanImg : policeImg;
  if(pImg && pImg.complete && pImg.naturalWidth){
    ctx.drawImage(pImg, -police.w/2, -police.h/2, police.w, police.h);
  } else {
    const g=ctx.createLinearGradient(-police.w/2,0,police.w/2,0);
    g.addColorStop(0,'#1a2a4a'); g.addColorStop(0.5,'#2a4a7a'); g.addColorStop(1,'#1a2a4a');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.roundRect(-police.w/2,-police.h/2,police.w,police.h,8); ctx.fill();
  }
  // luces de policía (barra + destello de ambiente)
  const t = performance.now();
  const phase = (t % 600) < 300;
  const a = 0.55 + 0.35 * Math.sin(t / 80);
  // barra de luces sobre el techo (aprox. centro superior del sprite)
  const lx = -police.w * 0.22, ly = -police.h * 0.12, lw = police.w * 0.44, lh = 7;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = phase ? `rgba(255,40,40,${a})` : `rgba(40,80,255,${a})`;
  ctx.fillRect(lx, ly, lw * 0.5, lh);
  ctx.fillStyle = phase ? `rgba(40,80,255,${a})` : `rgba(255,40,40,${a})`;
  ctx.fillRect(lx + lw * 0.5, ly, lw * 0.5, lh);
  // glow lateral
  ctx.globalAlpha = 0.2 * a;
  const glow = ctx.createRadialGradient(0, ly, 4, 0, ly, police.w * 0.7);
  glow.addColorStop(0, phase ? 'rgba(255,60,60,0.8)' : 'rgba(60,100,255,0.8)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, ly, police.w * 0.65, 0, Math.PI * 2); ctx.fill();
  // destellos en bordes de pantalla suaves
  ctx.restore();
  if(chaseIntroDone || chaseIntroProg > 0.4){
    ctx.save();
    ctx.globalAlpha = 0.100 + 0.50 * a;
    ctx.fillStyle = phase ? '#ff3030' : '#3060ff';
    if(phase) ctx.fillRect(0, 0, 18, H);
    else ctx.fillRect(W - 18, 0, 18, H);
    ctx.restore();
  }
}
function firePoliceBullets(){
  if(!police) return;
  bulletBurstLeft = (fightRound === 2) ? 5 : 4;
  bulletBurstGap = 0;
}
function firePoliceMissile(){
  if(!police) return;
  // si el jugador está detrás (Y mayor), disparar hacia abajo (+vy); si está delante, hacia arriba
  const towardPlayer = (PLAYER_Y > police.y);
  missiles.push({
    x:police.x,
    y: towardPlayer ? police.y+police.h*0.35 : police.y-police.h*0.4,
    vx:(playerX-police.x)*0.35,
    vy: towardPlayer ? (200+Math.random()*40) : -220,
    w:14, h:28, life:4, trail:[]
  });
  shake=Math.max(shake,4);
  playMissileLaunch();
}
function updatePoliceMissiles(dt){
  if(!police) return;
  missileTimer-=dt;
  if(missileTimer>0) return;
  firePoliceMissile();
  if(police.phase2){
    // 1 misil, 3s después otro, luego espera 40s
    if(police.missileWave===0){
      police.missileWave=1;
      missileTimer=3;
    } else {
      police.missileWave=0;
      missileTimer=40;
    }
  } else {
    missileTimer=60;
  }
}
function spawnMedkit(){
  if(medkits.length>=2) return;
  const laneN=Math.floor(Math.random()*3);
  medkits.push({lane:laneN, x:lanes[laneN], y:-30, r:18, rot:0});
}
function easeInOut(t){ return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }

/* ===== FASE 3 ESMAT — helpers ===== */
function playThunder(){
  try{
    if(sfxMuted) return;
    resumeAudio(); const t=actx.currentTime;
    const n=actx.createBufferSource(); n.buffer=createNoiseBuffer(1.2);
    const nf=actx.createBiquadFilter(); nf.type='lowpass';
    nf.frequency.setValueAtTime(800,t); nf.frequency.exponentialRampToValueAtTime(120,t+0.9);
    const ng=actx.createGain();
    ng.gain.setValueAtTime(0.001,t); ng.gain.linearRampToValueAtTime(0.9,t+0.05); ng.gain.exponentialRampToValueAtTime(0.001,t+1.1);
    n.connect(nf); nf.connect(ng); ng.connect(sfxGain||masterGain); n.start(t); n.stop(t+1.2);
  }catch(e){}
}
function playWaterJet(){
  try{
    if(sfxMuted) return;
    resumeAudio(); const t=actx.currentTime;
    const n=actx.createBufferSource(); n.buffer=createNoiseBuffer(3.4);
    const nf=actx.createBiquadFilter(); nf.type='bandpass';
    nf.frequency.setValueAtTime(900,t); nf.frequency.linearRampToValueAtTime(1600,t+0.4); nf.Q.value=0.5;
    const ng=actx.createGain();
    ng.gain.setValueAtTime(0.001,t); ng.gain.linearRampToValueAtTime(0.55,t+0.12);
    ng.gain.setValueAtTime(0.45,t+2.6); ng.gain.exponentialRampToValueAtTime(0.001,t+3.3);
    n.connect(nf); nf.connect(ng); ng.connect(sfxGain||masterGain); n.start(t); n.stop(t+3.4);
    // chorro grave
    const o=actx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(80,t); o.frequency.linearRampToValueAtTime(55,t+3);
    const og=actx.createGain(); og.gain.setValueAtTime(0.12,t); og.gain.exponentialRampToValueAtTime(0.001,t+3.2);
    o.connect(og); og.connect(sfxGain||masterGain); o.start(t); o.stop(t+3.2);
  }catch(e){}
}
function playVictoryCrowd(){
  try{
    if(sfxMuted) return;
    resumeAudio();
    const t = actx.currentTime;
    // aplausos (ruido rítmico)
    for(let i=0;i<12;i++){
      const n = actx.createBufferSource();
      n.buffer = createNoiseBuffer(0.15);
      const nf = actx.createBiquadFilter(); nf.type='bandpass';
      nf.frequency.value = 800 + Math.random()*1200; nf.Q.value = 0.8;
      const ng = actx.createGain();
      const st = t + i*0.18 + Math.random()*0.05;
      ng.gain.setValueAtTime(0.001, st);
      ng.gain.linearRampToValueAtTime(0.35, st+0.02);
      ng.gain.exponentialRampToValueAtTime(0.001, st+0.14);
      n.connect(nf); nf.connect(ng); ng.connect(sfxGain||masterGain);
      n.start(st); n.stop(st+0.15);
    }
    // gritos / cheer (osciladores)
    for(let i=0;i<6;i++){
      const o = actx.createOscillator();
      o.type = 'sawtooth';
      const st = t + 0.3 + i*0.35;
      o.frequency.setValueAtTime(280+Math.random()*200, st);
      o.frequency.linearRampToValueAtTime(400+Math.random()*150, st+0.25);
      const g = actx.createGain();
      g.gain.setValueAtTime(0.001, st);
      g.gain.linearRampToValueAtTime(0.12, st+0.05);
      g.gain.exponentialRampToValueAtTime(0.001, st+0.4);
      o.connect(g); g.connect(sfxGain||masterGain);
      o.start(st); o.stop(st+0.45);
    }
  }catch(e){}
}
function playRamImpact(){
  try{
    if(sfxMuted) return;
    resumeAudio(); const t=actx.currentTime;
    const o=actx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(35,t+0.28);
    const g=actx.createGain(); g.gain.setValueAtTime(0.55,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.3);
    o.connect(g); g.connect(sfxGain||masterGain); o.start(t); o.stop(t+0.32);
    const n=actx.createBufferSource(); n.buffer=createNoiseBuffer(0.25);
    const nf=actx.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value=600;
    const ng=actx.createGain(); ng.gain.setValueAtTime(0.4,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.22);
    n.connect(nf); nf.connect(ng); ng.connect(sfxGain||masterGain); n.start(t); n.stop(t+0.25);
  }catch(e){}
}
function spawnEsmatLightning(){
  const x = ROAD_LEFT + Math.random() * Math.max(40, ROAD_RIGHT - ROAD_LEFT);
  esmatBolts.push({
    x, life: 0.18 + Math.random()*0.12, max: 0.25,
    segs: Array.from({length: 7}, (_, i) => ({ dx: (Math.random()-0.5)*34, y: (H/7)*i }))
  });
  playThunder();
  shake = Math.max(shake, 10);
}
function initEsmat(){
  const laneN = Math.floor(Math.random()*3);
  esmat = {
    lane: laneN, x: lanes[laneN], targetX: lanes[laneN],
    y: H + 140,
    w: LANDSCAPE ? 105 : 118,
    h: LANDSCAPE ? 188 : 210,
    kind: 'esmat',
    _waterArmed: false, _waterDelay: 0, _burstStarted: false
  };
  esmatHP = 250; esmatMaxHP = 250;
}
function fireEsmatBullets(){
  if(!esmat) return;
  esmatBurstLeft = 6;
  esmatBurstGap = 0;
  esmat._burstStarted = true;
  esmat._waterArmed = true;
  esmat._waterDelay = 2;
}
function fireEsmatMissile(){
  if(!esmat) return;
  const dx = playerX - esmat.x;
  const dy = PLAYER_Y - esmat.y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const spd = 280;
  missiles.push({
    x: esmat.x,
    y: esmatFrontMode ? esmat.y + esmat.h*0.35 : esmat.y - esmat.h*0.4,
    vx: (dx/len)*spd * 0.35,
    vy: (dy/len)*spd,
    w:14, h:28, life:4.5, trail:[]
  });
  shake = Math.max(shake, 5);
  try{ playMissileLaunch(); }catch(e){}
}
function updateEsmatIntro(dt){
  if(fightRound !== 3 || !esmatPhase) return false;

  try {

  if(esmatPhase === 'wow'){
    esmatT += dt;
    traffic = [];
    if(fightBanner){ fightBanner.t -= dt; if(fightBanner.t <= 0) fightBanner = null; }
    if(esmatT >= 4.0){
      esmatPhase = 'best';
      esmatT = 0;
      setFightBanner('PERO AHORA VIENE LO MEJORR....', 5.0);
      thunderT = 0.3;
    }
    return true;
  }

  if(esmatPhase === 'best'){
    esmatT += dt;
    traffic = [];
    shake = Math.max(shake, 2 + Math.sin(esmatT * 18) * 2);
    thunderT -= dt;
    if(thunderT <= 0){
      try{ spawnEsmatLightning(); }catch(e){}
      thunderT = 0.7 + Math.random() * 0.5;
    }
    for(const b of esmatBolts) b.life -= dt;
    esmatBolts = esmatBolts.filter(b => b.life > 0);
    if(fightBanner){ fightBanner.t -= dt; if(fightBanner.t <= 0) fightBanner = null; }
    if(esmatT >= 5.0){
      esmatPhase = 'calm';
      esmatT = 0;
      esmatBolts = [];
      phase3ScoreBase = score;
      fightBanner = null;
    }
    return true;
  }

  if(esmatPhase === 'calm'){
    // Tráfico normal 50 puntos
    if(score >= phase3ScoreBase + 50){
      esmatPhase = 'approach';
      esmatT = 0;
      initEsmat();
    }
    return false;
  }

  if(esmatPhase === 'approach'){
    esmatT += dt;
    traffic = [];
    if(!esmat) initEsmat();
    // Jugador se adelanta lo suficiente para ver el camión ESMAT completo
    const homeY = H - (LANDSCAPE ? 72 : 85);
    const forwardY = Math.floor(H * (LANDSCAPE ? 0.40 : 0.36)); // más arriba en pantalla
    const e = Math.min(1, esmatT / 5.5);
    const ease = e * e * (3 - 2 * e);
    PLAYER_Y = Math.floor(homeY + (forwardY - homeY) * ease);
    // ESMAT detrás con hueco: centro detrás del jugador = se ve el camión entero
    const gap = (esmat.h * 0.58) + (LANDSCAPE ? 28 : 36);
    const targetY = PLAYER_Y + gap;
    esmat.y = (H + 200) + (targetY - (H + 200)) * ease;
    esmat.x += (playerX - esmat.x) * Math.min(1, 1.0 * dt);
    esmat.targetX = playerX;
    if(esmatT >= 5.5){
      PLAYER_Y = Math.floor(forwardY);
      esmat.y = targetY;
      esmatPhase = 'dlg1';
      esmatT = 0;
      esmatDialogue = { text: 'SOMOS EL E.S.M.A.T LE ORDENAMOS QUE SE DETENGA', t: 6, max: 6, who: 'esmat' };
    }
    return true;
  }

  if(esmatPhase === 'dlg1' || esmatPhase === 'dlg2' || esmatPhase === 'dlg3'){
    esmatT += dt;
    traffic = [];
    // Mantener jugador adelantado y camión completo a la vista
    const forwardY = Math.floor(H * (LANDSCAPE ? 0.40 : 0.36));
    PLAYER_Y = Math.floor(forwardY);
    if(esmat){
      const gap = (esmat.h * 0.58) + (LANDSCAPE ? 28 : 36);
      esmat.y += ((PLAYER_Y + gap) - esmat.y) * Math.min(1, 2 * dt);
      esmat.x += (playerX - esmat.x) * Math.min(1, 1.2 * dt);
    }
    if(esmatDialogue){
      esmatDialogue.t -= dt;
      if(esmatDialogue.t <= 0) esmatDialogue = null;
    }
    if(esmatPhase === 'dlg1' && esmatT >= 6){
      esmatPhase = 'dlg2'; esmatT = 0;
      esmatDialogue = { text: 'ME VALE VRG LO QUE USTEDES ME DIGAN!!...', t: 5, max: 5, who: 'player' };
    } else if(esmatPhase === 'dlg2' && esmatT >= 5){
      esmatPhase = 'dlg3'; esmatT = 0;
      esmatDialogue = { text: 'ATÉNGASE A LAS CONSECUENCIAS...', t: 3, max: 3, who: 'esmat' };
    } else if(esmatPhase === 'dlg3' && esmatT >= 3.2){
      esmatDialogue = null;
      esmatPhase = 'fight';
      esmatT = 0;
      playerAmmo = 30;
      reloadTimer = 0;
      phase3Medkits = 0;
      phase3ScoreBase = score;
      esmatLaneTimer = 4;
      esmatBulletTimer = 7;
      esmatMissileCycle = 8;
      esmatMissileStep = 0;
      esmatMissileWait = 0;
      esmatRamTimer = 7;
      esmatRamActive = 0;
      esmatPosTimer = 9;
      esmatFrontMode = false;
      playerRamShield = 0;
      playerRamShieldCD = 7;
      esmatBurstLeft = 0;
      try{ startActionMusic(); }catch(e){}
    }
    return true;
  }

  if(esmatPhase === 'dying'){
    esmatT += dt;
    traffic = [];
    if(esmat){
      // Inicializar derrape (como patrulla fase 1)
      if(esmat.driftDir == null){
        esmat.driftDir = Math.random() < 0.5 ? -1 : 1;
        esmat.driftLean = 0;
        esmat._screech = false;
        esmat._exploded = false;
        try{ stopActionMusic(); }catch(e){}
      }
      const hoodX = esmat.x;
      const hoodY = esmat.y - esmat.h * 0.35;

      if(esmatT < 3.0){
        // HUMO 3s en el capó (más denso que la patrulla)
        if(Math.random() < 0.65){
          particles.push({
            x: hoodX+(Math.random()-0.5)*28, y: hoodY+(Math.random()-0.5)*14,
            vx: (Math.random()-0.5)*20, vy: -28-Math.random()*40,
            life: 1.0+Math.random()*0.55, max: 1.0+Math.random()*0.55,
            size: 16+Math.random()*22, color: '#4a4a4a', smoke: true, rot: 0, vr: 0
          });
        }
        // temblor leve
        shake = Math.max(shake, 3);
      } else if(esmatT < 7.2){
        // FUEGO + DERRAPE lateral + rechinido
        if(!esmat._screech){ esmat._screech = true; try{ playTireScreech(); }catch(e){} }
        const driftT = esmatT - 3.0;
        esmat.x += esmat.driftDir * (45 + driftT * 60) * dt;
        esmat.driftLean = esmat.driftDir * Math.min(0.6, 0.14 + driftT * 0.13);
        esmat.y += (speed * 0.32 + 35) * dt;
        // fuego intenso
        if(Math.random() < 0.8){
          particles.push({
            x: hoodX+(Math.random()-0.5)*24, y: hoodY+(Math.random()-0.5)*10,
            vx: (Math.random()-0.5)*30, vy: -45-Math.random()*60,
            life: 0.45+Math.random()*0.4, max: 0.45+Math.random()*0.4,
            size: 7+Math.random()*14, color: ['#ff6020','#ffaa30','#ff3300','#fff0a0','#ff8040'][Math.floor(Math.random()*5)],
            rot: 0, vr: 0
          });
        }
        if(Math.random() < 0.4){
          particles.push({
            x: hoodX, y: hoodY, vx: (Math.random()-0.5)*14, vy: -22,
            life: 0.8, max: 0.8, size: 18, color: '#333', smoke: true, rot: 0, vr: 0
          });
        }
        // chispas
        if(Math.random() < 0.25){
          particles.push({
            x: esmat.x+(Math.random()-0.5)*esmat.w*0.4, y: esmat.y+esmat.h*0.2,
            vx: (Math.random()-0.5)*80, vy: -30-Math.random()*50,
            life: 0.3+Math.random()*0.25, max: 0.35, size: 3+Math.random()*4,
            color: '#ffe080', rot: 0, vr: 0
          });
        }
        if(esmat.x < ROAD_LEFT - 20 || esmat.x > ROAD_RIGHT + 20){
          esmat.x += esmat.driftDir * 90 * dt;
          esmat.y += speed * 0.55 * dt;
        }
        shake = Math.max(shake, 5 + driftT * 1.5);
      } else {
        // EXPLOSIÓN final grande
        if(!esmat._exploded){
          esmat._exploded = true;
          spawnCrashParticles(esmat.x, esmat.y, 55);
          spawnCrashParticles(esmat.x + 30, esmat.y - 20, 25);
          spawnCrashParticles(esmat.x - 30, esmat.y - 10, 25);
          try{ playMeteorExplosion(); }catch(e){}
          shake = Math.max(shake, 22);
        }
        esmat.y += speed * 0.7 * dt;
        esmat.x += esmat.driftDir * 40 * dt;
      }
    }
    // ~8.5s total → victoria
    if(esmatT >= 8.5){
      esmat = null;
      esmatPhase = 'win1';
      esmatT = 0;
      try{ playVictoryCrowd(); }catch(e){}
      setFightBanner('INCREÍBLE, LO LOGRASTE!!!', 3.5);
    }
    return true;
  }

  // Victoria: banners → interferencia → WIN → menú
  if(esmatPhase === 'win1'){
    esmatT += dt;
    traffic = [];
    if(fightBanner){ fightBanner.t -= dt; if(fightBanner.t <= 0) fightBanner = null; }
    if(esmatT >= 3.5){
      esmatPhase = 'win2';
      esmatT = 0;
      setFightBanner('HAS GANADO ESTE MODO!!!', 3.5);
    }
    return true;
  }
  if(esmatPhase === 'win2'){
    esmatT += dt;
    traffic = [];
    if(fightBanner){ fightBanner.t -= dt; if(fightBanner.t <= 0) fightBanner = null; }
    if(esmatT >= 3.5){
      esmatPhase = 'winGlitch';
      esmatT = 0;
      fightBanner = null;
    }
    return true;
  }
  if(esmatPhase === 'winGlitch'){
    esmatT += dt;
    traffic = [];
    shake = Math.max(shake, 6);
    if(esmatT >= 2.2){
      esmatPhase = 'winBlack';
      esmatT = 0;
    }
    return true;
  }
  if(esmatPhase === 'winBlack'){
    esmatT += dt;
    traffic = [];
    if(esmatT >= 2.8){
      esmatPhase = null;
      fightRound = 0;
      running = false;
      over = true;
      try{ stopMusic(); stopEngine(); stopSiren(); }catch(e){}
      showMainMenu();
    }
    return true;
  }

  if(esmatPhase === 'cleared'){
    // compat: redirigir a victoria
    esmatPhase = 'win1';
    esmatT = 0;
    try{ playVictoryCrowd(); }catch(e){}
    setFightBanner('INCREÍBLE, LO LOGRASTE!!!', 3.5);
    return true;
  }

  return esmatPhase === 'fight';

  } catch(err){
    console.warn('updateEsmatIntro', err);
    return true;
  }
}

function updateEsmatFight(dt){
  if(esmatPhase !== 'fight' || !esmat) return;
  try {
  traffic = []; // sin tráfico en pelea ESMAT

  // Mantener jugador adelantado: camión ESMAT se ve completo detrás
  const forwardY = Math.floor(H * (LANDSCAPE ? 0.40 : 0.36));
  PLAYER_Y = Math.floor(forwardY);

  const off = Math.max(0, score - phase3ScoreBase);
  const cycle = off % 667;
  phase3Apocalypse = (cycle >= 300);

  esmatLaneTimer -= dt;
  if(esmatLaneTimer <= 0){
    const opts = [0,1,2].filter(n => n !== esmat.lane);
    esmat.lane = opts[Math.floor(Math.random() * opts.length)];
    esmat.targetX = lanes[esmat.lane];
    esmatLaneTimer = 4;
  }

  esmatPosTimer -= dt;
  if(esmatPosTimer <= 0){
    esmatFrontMode = !esmatFrontMode;
    esmatPosTimer = 9;
  }
  const gap = (esmat.h * 0.58) + (LANDSCAPE ? 28 : 36);
  const backY = PLAYER_Y + gap;
  // delante: aún cabe el camión sin salir de pantalla
  const frontY = Math.max(esmat.h * 0.52 + 12, Math.floor(H * 0.22));
  const wantY = esmatFrontMode ? frontY : backY;

  // Choque lateral
  esmatRamTimer -= dt;
  if(esmatRamTimer <= 0 && esmatRamActive <= 0){
    esmatRamActive = 6;
    esmatRamTimer = 13;
    esmat.ramSide = (Math.random() < 0.5) ? -1 : 1;
  }
  if(esmatRamActive > 0){
    esmatRamActive -= dt;
    const sideX = playerX + esmat.ramSide * (LANDSCAPE ? 70 : 62);
    esmat.x += (sideX - esmat.x) * Math.min(1, 1.5 * dt);
    esmat.y += (PLAYER_Y - esmat.y) * Math.min(1, 1.1 * dt);
    esmatRamHitT -= dt;
    if(esmatRamHitT <= 0 && Math.abs(esmat.x - playerX) < 70 && Math.abs(esmat.y - PLAYER_Y) < 100){
      if(playerRamShield <= 0){
        if(!GOD_MODE) health = Math.max(0, health - 4);
        try{ playRamImpact(); }catch(e){}
        shake = Math.max(shake, 10);
        spawnCrashParticles((esmat.x + playerX) / 2, PLAYER_Y, 10);
        if(!GOD_MODE && health <= 0){ health = 0; triggerHealthDeath(); return; }
      }
      esmatRamHitT = 0.55;
    }
  } else {
    esmat.x += (esmat.targetX - esmat.x) * Math.min(1, 1.35 * dt);
    esmat.y += (wantY - esmat.y) * Math.min(1, 1.05 * dt);
  }

  // Balas
  esmatBulletTimer -= dt;
  if(esmatBulletTimer <= 0){ fireEsmatBullets(); esmatBulletTimer = 7; }
  if(esmatBurstLeft > 0){
    esmatBurstGap -= dt;
    if(esmatBurstGap <= 0){
      const dx = playerX - esmat.x;
      const dy = PLAYER_Y - esmat.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const spd = 380;
      bullets.push({
        x: esmat.x + (Math.random()-0.5)*16,
        y: esmat.y + (esmatFrontMode ? esmat.h*0.3 : -esmat.h*0.3),
        vx: (dx/len)*spd + (Math.random()-0.5)*40,
        vy: (dy/len)*spd,
        r: 5, life: 3.0
      });
      esmatBurstLeft--;
      esmatBurstGap = 0.1;
      try{ playGunshot(); }catch(e){}
    }
  }

  if(esmat._waterArmed){
    esmat._waterDelay -= dt;
    if(esmat._waterDelay <= 0){
      esmat._waterArmed = false;
      esmatWaterTimer = 3;
      esmatWaterBlind = 5;
      try{ playWaterJet(); }catch(e){}
    }
  }
  if(esmatWaterTimer > 0){
    esmatWaterTimer -= dt;
    esmat.waterAimX = playerX;
    esmat.waterAimY = PLAYER_Y;
  }
  if(esmatWaterBlind > 0) esmatWaterBlind -= dt;

  esmatMissileCycle -= dt;
  if(esmatMissileCycle <= 0 && esmatMissileStep === 0){
    esmatMissileStep = 1;
    esmatMissileWait = 0;
    esmatMissileCycle = 8;
  }
  if(esmatMissileStep > 0){
    esmatMissileWait -= dt;
    if(esmatMissileWait <= 0){
      fireEsmatMissile();
      if(esmatMissileStep === 1){ esmatMissileStep = 2; esmatMissileWait = 2; }
      else esmatMissileStep = 0;
    }
  }

  // Escudos jugador
  if(playerRamShield > 0){
    playerRamShield -= dt;
    if(!esmat.playerRamSide) esmat.playerRamSide = (playerX <= esmat.x) ? -1 : 1;
    const want = esmat.x + esmat.playerRamSide * (LANDSCAPE ? 72 : 64);
    playerTargetX = want;
    playerX += (want - playerX) * Math.min(1, 2.0 * dt);
    let bestL = 0, bestD = 1e9;
    for(let i=0;i<3;i++){ const d=Math.abs(lanes[i]-playerX); if(d<bestD){bestD=d;bestL=i;} }
    lane = bestL;
    playerRamHitT -= dt;
    if(playerRamHitT <= 0 && Math.abs(playerX - esmat.x) < 78 && Math.abs(PLAYER_Y - esmat.y) < 110){
      esmatHP = Math.max(0, esmatHP - 4);
      esmat.x += esmat.playerRamSide * -8 + (Math.random()-0.5)*6;
      try{ playRamImpact(); }catch(e){}
      shake = Math.max(shake, 7);
      spawnCrashParticles(esmat.x, esmat.y, 8);
      playerRamHitT = 0.5;
      if(esmatHP <= 0){
        esmatHP = 0; esmatPhase = 'dying'; esmatT = 0;
        playerBullets = []; bullets = []; missiles = [];
        return;
      }
    }
  } else {
    esmat.playerRamSide = null;
    playerRamShieldCD -= dt;
    if(playerRamShieldCD <= 0){
      playerRamShield = 6;
      playerRamShieldCD = 13;
      esmat.playerRamSide = (playerX <= esmat.x) ? -1 : 1;
    }
  }

  for(const b of playerBullets){
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if(Math.abs(b.x - esmat.x) < esmat.w * 0.45 && Math.abs(b.y - esmat.y) < esmat.h * 0.45){
      b.life = -1;
      esmatHP = Math.max(0, esmatHP - 4);
      spawnCrashParticles(b.x, b.y, 5);
      if(esmatHP <= 0){
        esmatHP = 0; esmatPhase = 'dying'; esmatT = 0;
        playerBullets = []; bullets = []; missiles = [];
        break;
      }
    }
  }
  playerBullets = playerBullets.filter(b => b.life > 0 && b.y > -40);

  if(reloadTimer > 0){
    reloadTimer -= dt;
    if(reloadTimer <= 0){ reloadTimer = 0; playerAmmo = 30; }
  }

  if(phase3Medkits < 4){
    medkitSpawn += dt;
    if(medkitSpawn > 8 && medkits.length < 1){
      spawnMedkit();
      medkitSpawn = 0;
      phase3Medkits++;
    }
  }
  for(const k of medkits){
    k.y += (speed * 0.85) * dt;
    k.rot = (k.rot || 0) + dt * 2;
    if(Math.abs(k.x - playerX) < 40 && Math.abs(k.y - PLAYER_Y) < 50){
      k.got = true;
      health = Math.min(100, health + 16);
    }
  }
  medkits = medkits.filter(k => !k.got && k.y < H + 40);

  } catch(err){
    console.warn('updateEsmatFight', err);
  }
}


function updateChase(dt){
  if(gameMode!=='chase') return;
  pullChaseState();

  // ===== FASE 3 ESMAT (intro / diálogos / pelea) =====
  let esmatBlock = false;
  try {
    esmatBlock = updateEsmatIntro(dt);
  } catch(e){ console.warn('esmat intro', e); }
  if(esmatBlock){
    if(esmatPhase === 'fight'){
      try{ updateEsmatFight(dt); }catch(e){ console.warn('esmat fight', e); }
    }
    // Intro / diálogos / victoria: no seguir lógica de policía
    if(esmatPhase !== 'fight' && esmatPhase !== 'calm'){
      if(fightBanner){ fightBanner.t -= dt; if(fightBanner.t <= 0) fightBanner = null; }
      pushChaseState();
      return;
    }
  } else if(esmatPhase === 'fight'){
    try{ updateEsmatFight(dt); }catch(e){ console.warn('esmat fight', e); }
  }

  // intro: ambos suben desde abajo hasta su posición final
  if(!chaseIntroDone){
    chaseIntroT+=dt;
    if(!police) initPolice();
    const cam=getChaseTargets();
    const startPlayerY = H - (LANDSCAPE ? 72 : 85);
    const startPoliceY = H + cam.polH/2 + 30;
    chaseIntroProg = Math.min(1, chaseIntroT / 2.8);
    const e = easeInOut(chaseIntroProg);
    PLAYER_Y = Math.floor(startPlayerY + (cam.py - startPlayerY) * e);
    if(police){
      police.w=cam.polW; police.h=cam.polH;
      police.targetY=cam.poly;
      police.y = startPoliceY + (cam.poly - startPoliceY) * e;
      police.targetX=playerX;
      police.x+=(police.targetX-police.x)*Math.min(1,2.5*dt);
    }
    if(chaseIntroProg>=1){
      chaseIntroDone=true;
      PLAYER_Y=cam.py;
      if(police) police.y=cam.poly;
      startSiren();
    }
    pushChaseState();
    return;
  }

  // ===== FASES POST-DERROTA (police puede ser null) =====
  if(fightPhase==='won'){
    fightT+=dt;
    traffic=[];
    if(fightBanner){ fightBanner.t-=dt; if(fightBanner.t<=0) fightBanner=null; }
    if(fightT>3.2){
      fightPhase='taunt';
      fightT=0;
      setFightBanner('PERO... ¿CREES QUE ACABÓ?', 3.0);
    }
    pushChaseState();
    return;
  }

  if(fightPhase==='taunt'){
    fightT+=dt;
    traffic=[];
    if(fightBanner){ fightBanner.t-=dt; if(fightBanner.t<=0) fightBanner=null; }
    if(fightT>3.0){
      fightPhase='vanIntro';
      fightT=0;
      stopActionMusic();
      const c2=getChaseTargets();
      PLAYER_Y=c2.py;
      initPolice('van');
      if(police){
        police.y = H + police.h/2 + 40;
        police.targetY = c2.poly;
        police.missileWave=0;
      }
      bulletTimer=6;
      missileTimer=8;
      startSiren();
    }
    pushChaseState();
    return;
  }

  if(fightPhase==='vanIntro'){
    fightT+=dt;
    traffic=[];
    if(!police){ initPolice('van'); }
    const c2=getChaseTargets();
    PLAYER_Y=c2.py;
    const e = easeInOut(Math.min(1, fightT/3.0));
    const startY = H + police.h/2 + 40;
    police.y = startY + (c2.poly - startY)*e;
    police.w = LANDSCAPE?86:96;
    police.h = LANDSCAPE?155:170;
    police.targetX = playerX;
    police.x += (police.targetX - police.x)*Math.min(1, 2.5*dt);
    if(fightT>=3.0){
      police.y = c2.poly;
      fightPhase='done';
      // tráfico vuelve (spawn se reactiva con fightPhase==='done')
    }
    pushChaseState();
    return;
  }

  // DYING: humo 3s → fuego+derrape 4s → sale de carretera y explota quedándose atrás
  if(fightPhase==='dying'){
    policeDyingT+=dt;
    traffic=[];
    if(police){
      // dirección de derrape fija por partida
      if(police.driftDir==null){
        police.driftDir = Math.random()<0.5 ? -1 : 1;
        police.driftLean = 0;
        police._screech = false;
      }
      // capó = parte delantera del sprite (arriba = -h)
      const hoodX = police.x;
      const hoodY = police.y - police.h * 0.38;

      if(policeDyingT < 3.0){
        // HUMO 3s en el capó
        if(Math.random()<0.55){
          particles.push({
            x:hoodX+(Math.random()-0.5)*22, y:hoodY+(Math.random()-0.5)*10,
            vx:(Math.random()-0.5)*18, vy:-25-Math.random()*35,
            life:0.9+Math.random()*0.5, max:0.9+Math.random()*0.5,
            size:14+Math.random()*18, color:'#4a4a4a', smoke:true, rot:0, vr:0
          });
        }
      } else if(policeDyingT < 7.0){
        // FUEGO 4s en el capó + derrape
        if(!police._screech){ police._screech=true; playTireScreech(); }
        const driftT = policeDyingT - 3.0;
        // se desvía hacia un lado
        police.x += police.driftDir * (40 + driftT * 55) * dt;
        police.driftLean = police.driftDir * Math.min(0.55, 0.12 + driftT * 0.12);
        // se va quedando atrás mientras el jugador avanza
        police.y += (speed * 0.35 + 30) * dt;
        // fuego en capó
        if(Math.random()<0.7){
          particles.push({
            x:hoodX+(Math.random()-0.5)*20, y:hoodY+(Math.random()-0.5)*8,
            vx:(Math.random()-0.5)*25, vy:-40-Math.random()*55,
            life:0.4+Math.random()*0.35, max:0.4+Math.random()*0.35,
            size:6+Math.random()*12, color:['#ff6020','#ffaa30','#ff3300','#fff0a0'][Math.floor(Math.random()*4)],
            rot:0, vr:0
          });
        }
        if(Math.random()<0.35){
          particles.push({
            x:hoodX, y:hoodY, vx:(Math.random()-0.5)*12, vy:-20,
            life:0.7, max:0.7, size:16, color:'#333', smoke:true, rot:0, vr:0
          });
        }
        // si ya salió de la carretera, acelerar salida
        if(police.x < ROAD_LEFT - 20 || police.x > ROAD_RIGHT + 20){
          police.x += police.driftDir * 80 * dt;
          police.y += speed * 0.5 * dt;
        }
      } else {
        // EXPLOSIÓN al salirse / fin de secuencia
        if(!police._exploded){
          police._exploded=true;
          spawnCrashParticles(police.x, police.y, 45);
          playMeteorExplosion();
          shake=Math.max(shake,18);
          for(let i=0;i<10;i++){
            particles.push({
              x:police.x, y:police.y,
              vx:(Math.random()-0.5)*180, vy:-60-Math.random()*120,
              life:0.6+Math.random()*0.5, max:0.6+Math.random()*0.5,
              size:5+Math.random()*10, color:['#ff4010','#ffaa30','#fff'][i%3], rot:0, vr:0
            });
          }
        }
        // seguir un poco atrás y desaparecer
        police.y += speed * 0.6 * dt;
        if(policeDyingT > 7.8){
          police=null;
          fightT=0;
          if(fightRound === 2){
            fightPhase='cleared';
            try{ stopActionMusic(); }catch(e){}
            setFightBanner('¡HAS DERROTADO AL FURGÓN!', 3.5);
          } else {
            fightPhase='won';
            setFightBanner('HAS SUPERADO ESTA FASE!!', 3.2);
          }
        }
      }
    } else {
      if(fightRound === 2){
        fightPhase='cleared'; fightT=0;
        try{ stopActionMusic(); }catch(e){}
        setFightBanner('¡HAS DERROTADO AL FURGÓN!', 3.5);
      } else {
        fightPhase='won'; fightT=0;
        setFightBanner('HAS SUPERADO ESTA FASE!!', 3.2);
      }
    }
    if(fightBanner){ fightBanner.t-=dt; if(fightBanner.t<=0) fightBanner=null; }
    pushChaseState();
    return;
  }

  // Fin jefes fase 2
    if(fightPhase === 'cleared'){
    fightT += dt;
    traffic = [];
    if(fightBanner){ fightBanner.t -= dt; if(fightBanner.t <= 0) fightBanner = null; }
    if(fightT > 3.5){
      fightPhase = null;
      fightRound = 3;
      esmatPhase = 'wow';
      esmatT = 0;
      setFightBanner('WOOW... PARECE QUE ERES BUENO', 4.0);
    }
    pushChaseState();
    return;
  }

  // ===== Fase 3 ESMAT activa: solo balas/misiles, sin lógica de policía =====
  const esmatActive = (fightRound === 3) || (esmatPhase && esmatPhase !== 'calm');
  if(esmatActive){
    // Actualizar proyectiles del ESMAT (no tocar police)
    const bulletDmg = 8;
    const missileDmg = 9;
    for(const b of bullets){
      b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
      if(Math.abs(b.x-playerX)<28 && Math.abs(b.y-PLAYER_Y)<40){
        b.life=-1;
        if(!GOD_MODE) health = Math.max(0, health - bulletDmg);
        shake=Math.max(shake,5);
        try{ playHitImpact(); }catch(e){}
        spawnCrashParticles(playerX, PLAYER_Y-20, 8);
        if(!GOD_MODE && health<=0){ health=0; pushChaseState(); triggerHealthDeath(); return; }
      }
    }
    bullets=bullets.filter(b=>b.life>0 && b.y>-40 && b.y<H+40);
    for(const m of missiles){
      m.vx+=(playerX-m.x)*1.8*dt;
      m.vx=Math.max(-180,Math.min(180,m.vx));
      m.x+=m.vx*dt; m.y+=m.vy*dt; m.life-=dt;
      if(!m.trail) m.trail=[];
      m.trail.push({x:m.x,y:m.y}); if(m.trail.length>8) m.trail.shift();
      if(Math.abs(m.x-playerX)<36 && Math.abs(m.y-PLAYER_Y)<48){
        m.life=-1;
        if(!GOD_MODE) health = Math.max(0, health - missileDmg);
        shake=Math.max(shake,12);
        try{ playHitImpact(); }catch(e){}
        spawnCrashParticles(playerX, PLAYER_Y-10, 20);
        if(!GOD_MODE && health<=0){ health=0; pushChaseState(); triggerHealthDeath(); return; }
      }
    }
    missiles=missiles.filter(m=>m.life>0 && m.y>-60 && m.y<H+60);
    if(fightBanner){ fightBanner.t-=dt; if(fightBanner.t<=0) fightBanner=null; }
    pushChaseState();
    return;
  }

  // a partir de aquí se necesita policía
  if(!police){ pushChaseState(); return; }

  // --- FASE 1: pickup a los 400 pts (nunca durante fase 3) ---
  if(!fightPhase && chaseIntroDone && score>=400 && fightRound!==3 && !esmatPhase && (!police || police.kind!=='van')){
    fightRound=1;
    fightPhase='warn';
    fightT=0;
    traffic=[];
    setFightBanner('A PELEAR CON BALA', 2.8);
  }

  // --- FASE 2: furgón a los 1100 pts ---
  if(fightPhase==='done' && police && police.kind==='van' && score>=1100 && fightRound!==3){
    fightRound=2;
    fightPhase='warn';
    fightT=0;
    traffic=[];
    fightMissileStep=0;
    fightMissileWait=0;
    fightMedkitsSpawned=0;
    setFightBanner('¡FURGÓN EN COMBATE!', 2.8);
  }

  const cam=getChaseTargets();
  if(police && police.kind!=='van'){
    police.w=cam.polW; police.h=cam.polH;
  }

  // WARN
  if(fightPhase==='warn'){
    fightT+=dt;
    traffic=[];
    if(fightT>2.8){
      fightPhase='reposition';
      fightT=0;
      police.targetY = Math.floor(H * 0.32);
      police.lane = Math.floor(Math.random()*3);
      police.targetX = lanes[police.lane];
    }
    if(fightBanner){ fightBanner.t-=dt; if(fightBanner.t<=0) fightBanner=null; }
    pushChaseState();
    return;
  }

  // REPOSITION
  if(fightPhase==='reposition'){
    fightT+=dt;
    traffic=[];
    const e = easeInOut(Math.min(1, fightT/2.2));
    const polStart = cam.poly;
    const polEnd = Math.floor(H * 0.30);
    police.y = polStart + (polEnd - polStart)*e;
    police.x += (lanes[police.lane] - police.x)*Math.min(1, 4*dt);
    const pyStart = cam.py;
    const pyEnd = Math.floor(H * 0.72);
    PLAYER_Y = Math.floor(pyStart + (pyEnd - pyStart)*e);
    if(fightT>0.3){
      const opts=[0,1,2].filter(n=>n!==police.lane);
      if(lane===police.lane) lane=opts[0];
      playerTargetX=lanes[lane];
    }
    if(fightT>=2.2){
      fightPhase='fight';
      fightT=0;
      if(fightRound===2){
        policeHP=310; policeMaxHP=310;
        policeLaneTimer=4;
        bulletTimer=6; missileTimer=7;
        fightMissileStep=0; fightMissileWait=0;
      } else {
        policeHP=200; policeMaxHP=200;
        policeLaneTimer=10;
        bulletTimer=4; missileTimer=20;
      }
      playerAmmo=25; reloadTimer=0;
      police.y = Math.floor(H * 0.30);
      PLAYER_Y = Math.floor(H * 0.72);
      startActionMusic();
      setFightBanner(fightRound===2 ? '¡LUCHA FASE 2!' : '¡LUCHA!', 1.5);
    }
    if(fightBanner){ fightBanner.t-=dt; if(fightBanner.t<=0) fightBanner=null; }
    pushChaseState();
    return;
  }

  // FIGHT
  if(fightPhase==='fight'){
    const laneEvery = (fightRound===2) ? 4 : 10;
    policeLaneTimer-=dt;
    if(policeLaneTimer<=0){
      const opts=[0,1,2].filter(n=>n!==police.lane);
      police.lane=opts[Math.floor(Math.random()*opts.length)];
      police.targetX=lanes[police.lane];
      policeLaneTimer=laneEvery;
    }
    police.x += (police.targetX - police.x)*Math.min(1, 3*dt);
    police.y = Math.floor(H * 0.30);
    PLAYER_Y = Math.floor(H * 0.72);

    if(reloadTimer>0){
      reloadTimer-=dt;
      if(reloadTimer<=0){ reloadTimer=0; playerAmmo=25; }
    }

    const dmgToPolice = (fightRound===2) ? 3 : 5;
    for(const b of playerBullets){
      b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
      if(police && Math.abs(b.x-police.x)<police.w*0.4 && Math.abs(b.y-police.y)<police.h*0.4){
        b.life=-1;
        policeHP=Math.max(0, policeHP-dmgToPolice);
        spawnCrashParticles(b.x, b.y, 4);
        if(policeHP<=0){
          policeHP=0;
          fightPhase='dying';
          policeDyingT=0;
          playerBullets=[]; bullets=[]; missiles=[];
          if(fightBanner){ fightBanner.t-=dt; if(fightBanner.t<=0) fightBanner=null; }
          pushChaseState();
          return;
        }
      }
    }
    playerBullets=playerBullets.filter(b=>b.life>0 && b.y>-40);

    const bulletEvery = (fightRound===2) ? 6 : 16;
    bulletTimer-=dt;
    if(bulletTimer<=0){
      firePoliceBullets();
      bulletTimer=bulletEvery;
      if(fightRound===2){
        fightMissileStep=1;
        fightMissileWait=2.0;
      }
    }
    if(bulletBurstLeft>0){
      bulletBurstGap-=dt;
      if(bulletBurstGap<=0){
        const totalBurst = (fightRound===2) ? 5 : 4;
        const spread=(totalBurst-bulletBurstLeft-1.5)*12;
        bullets.push({
          x:police.x+spread*0.3, y:police.y+police.h*0.35,
          vx:(playerX-police.x)*0.2+(Math.random()-0.5)*25,
          vy:320+Math.random()*50,
          r:4, life:2.5
        });
        bulletBurstLeft--;
        bulletBurstGap=0.12;
        playGunshot();
      }
    }

    if(fightRound===2){
      if(fightMissileStep>0){
        fightMissileWait-=dt;
        if(fightMissileWait<=0){
          firePoliceMissile();
          if(fightMissileStep===1){
            fightMissileStep=2;
            fightMissileWait=2.0;
          } else {
            fightMissileStep=0;
          }
        }
      }
      missileTimer-=dt;
      if(missileTimer<=0 && fightMissileStep===0){
        fightMissileStep=1;
        fightMissileWait=0;
        missileTimer=7;
      }
    } else {
      missileTimer-=dt;
      if(missileTimer<=0){
        firePoliceMissile();
        missileTimer=60;
      }
    }
  } else if(fightPhase==='done' || !fightPhase){
    // persecución normal: policía detrás del jugador
    police.targetX=playerX;
    police.x+=(police.targetX-police.x)*Math.min(1,3.2*dt);
    const c3=applyChaseCamera();
    police.y=c3.poly;
    police.lane=lane;
    if(police.kind==='van'){
      police.w = LANDSCAPE?86:96;
      police.h = LANDSCAPE?155:170;
    }

    if(chaseIntroDone){
      bulletTimer-=dt;
      if(bulletTimer<=0){ firePoliceBullets(); bulletTimer=16; }
      if(bulletBurstLeft>0){
        bulletBurstGap-=dt;
        if(bulletBurstGap<=0){
          const spread=(4-bulletBurstLeft-1.5)*12;
          bullets.push({
            x:police.x+spread*0.3, y:police.y-police.h*0.45,
            vx:(playerX-police.x)*0.15+(Math.random()-0.5)*20,
            vy:-340-Math.random()*40,
            r:4, life:2.5
          });
          bulletBurstLeft--; bulletBurstGap=0.12; playGunshot();
        }
      }
      updatePoliceMissiles(dt);
    }
  }

  // balas policía / ESMAT vs jugador
  const bulletDmg = (esmatPhase==='fight' || fightRound===3) ? 8 : ((fightRound===2) ? 7 : 8);
  const missileDmg = (esmatPhase==='fight' || fightRound===3) ? 9 : ((fightRound===2) ? 13 : 17);
  for(const b of bullets){
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    if(Math.abs(b.x-playerX)<28 && Math.abs(b.y-PLAYER_Y)<40){
      b.life=-1;
      if(!GOD_MODE) health = Math.max(0, health - bulletDmg);
      shake=Math.max(shake,5);
      playHitImpact();
      spawnCrashParticles(playerX, PLAYER_Y-20, 8);
      if(!GOD_MODE && health<=0){ health=0; pushChaseState(); triggerHealthDeath(); return; }
    }
  }
  bullets=bullets.filter(b=>b.life>0 && b.y>-40 && b.y<H+40);

  for(const m of missiles){
    m.vx+=(playerX-m.x)*1.8*dt;
    m.vx=Math.max(-180,Math.min(180,m.vx));
    m.x+=m.vx*dt; m.y+=m.vy*dt; m.life-=dt;
    if(!m.trail) m.trail=[];
    m.trail.push({x:m.x,y:m.y}); if(m.trail.length>8) m.trail.shift();
    if(Math.abs(m.x-playerX)<36 && Math.abs(m.y-PLAYER_Y)<48){
      m.life=-1;
      if(!GOD_MODE) health = Math.max(0, health - missileDmg);
      shake=Math.max(shake,12);
      playHitImpact();
      spawnCrashParticles(playerX, PLAYER_Y-10, 20);
      if(!GOD_MODE && health<=0){ health=0; pushChaseState(); triggerHealthDeath(); return; }
    }
  }
  missiles=missiles.filter(m=>m.life>0 && m.y>-60 && m.y<H+60);

  // Botiquines: persecución normal + hasta 3 en lucha del furgón (fase 2)
  const inFight = (fightPhase==='fight' || fightPhase==='dying' || fightPhase==='warn' || fightPhase==='reposition');
  const allowFightMedkits = (fightPhase==='fight' && fightRound===2);

  if(!inFight || allowFightMedkits){
    if(allowFightMedkits){
      medkitSpawn += dt;
      if(medkitSpawn > 5 && medkits.length < 1 && fightMedkitsSpawned < 3){
        spawnMedkit();
        medkitSpawn = 0;
        fightMedkitsSpawned++;
      }
    } else {
      if(health < 80){
        medkitSpawn += dt;
        if(medkitSpawn > 7 && medkits.length < 1){
          spawnMedkit();
          medkitSpawn = 0;
        }
      }
    }
    for(const k of medkits){
      k.y += (speed * 0.85) * dt;
      k.rot += dt * 2;
      if(Math.abs(k.x - playerX) < 40 && Math.abs(k.y - PLAYER_Y) < 50){
        k.got = true;
        health = Math.min(100, health + 6);
      }
    }
    medkits = medkits.filter(k => !k.got && k.y < H + 40);
  } else {
    medkits = [];
  }

  if(fightBanner){ fightBanner.t-=dt; if(fightBanner.t<=0) fightBanner=null; }
  pushChaseState();
}
function drawChase(){
  if(gameMode!=='chase') return;
  pullChaseState();


  // botiquines
  for(const k of medkits){
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate((k.rot||0)*0.2);
    ctx.fillStyle='#e8f8e8';
    ctx.beginPath(); ctx.roundRect(-14,-14,28,28,5); ctx.fill();
    ctx.fillStyle='#e03030';
    ctx.fillRect(-3,-10,6,20);
    ctx.fillRect(-10,-3,20,6);
    ctx.strokeStyle='#2a8a40'; ctx.lineWidth=2;
    ctx.stroke();
    ctx.restore();
  }

  // balas
  for(const b of bullets){
    ctx.fillStyle='#ffe060';
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r||4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(b.x,b.y-2,2,0,Math.PI*2); ctx.fill();
  }

  // misiles
  for(const m of missiles){
    if(m.trail){
      for(let i=0;i<m.trail.length;i++){
        const t=m.trail[i];
        ctx.globalAlpha=0.15+i*0.08;
        ctx.fillStyle='#ff6020';
        ctx.beginPath(); ctx.arc(t.x,t.y,3+i*0.4,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
    }
    ctx.save();
    ctx.translate(m.x,m.y);
    const ang=Math.atan2(m.vy,m.vx)+Math.PI/2;
    ctx.rotate(ang);
    ctx.fillStyle='#c0c4c8';
    ctx.beginPath(); ctx.roundRect(-5,-14,10,28,3); ctx.fill();
    ctx.fillStyle='#ff4020';
    ctx.beginPath(); ctx.moveTo(-5,14); ctx.lineTo(0,22); ctx.lineTo(5,14); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#4060a0';
    ctx.fillRect(-5,-14,10,6);
    ctx.restore();
  }

  if(police) drawPoliceCar();

  // balas del jugador
  for(const b of playerBullets){
    ctx.fillStyle='#7dff9a';
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r||3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(b.x,b.y-1.5,1.5,0,Math.PI*2); ctx.fill();
  }

  drawHealthBar();

  // vida patrulla
  if(fightPhase==='fight' && police){
    const barW=Math.min(180,W*0.5), barH=12;
    const x=W/2-barW/2, y=10;
    ctx.fillStyle='rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(x-2,y-2,barW+4,barH+4,5); ctx.fill();
    ctx.fillStyle='#1a1020';
    ctx.fillRect(x,y,barW,barH);
    const pct=Math.max(0,policeHP/policeMaxHP);
    ctx.fillStyle=pct>0.4?'#4080ff':'#ff4060';
    ctx.fillRect(x,y,barW*pct,barH);
    ctx.fillStyle='#c8e0ff';
    ctx.font='bold 10px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('🚔 PATRULLA '+Math.ceil(policeHP)+'/'+policeMaxHP, W/2, y-4);
    ctx.textAlign='left';
    ctx.fillStyle=reloadTimer>0?'#ffaa60':'#a0ffc0';
    ctx.font='bold 11px sans-serif';
    if(reloadTimer>0) ctx.fillText('RECARGA '+reloadTimer.toFixed(1)+'s', 12, H-38);
    else ctx.fillText('🔫 '+playerAmmo+'/25', 12, H-38);
  }

  // banner
  if(fightBanner){
    const a=Math.min(1, fightBanner.t, fightBanner.max-fightBanner.t);
    const shakeX = (esmatPhase==='best') ? Math.sin(performance.now()/40)*4 : 0;
    ctx.save();
    ctx.globalAlpha=Math.min(1,a*2);
    ctx.fillStyle='rgba(0,0,0,0.55)';
    ctx.fillRect(0, H*0.38, W, 56);
    ctx.fillStyle='#ffcc40';
    ctx.font='bold 20px sans-serif';
    ctx.textAlign='center';
    ctx.fillText(fightBanner.text, W/2 + shakeX, H*0.38+36);
    ctx.restore();
  }

  // rayos fase 3 intro
  for(const b of esmatBolts){
    ctx.save();
    ctx.strokeStyle = 'rgba(200,230,255,' + (b.life/b.max) + ')';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#aaf';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(b.x, 0);
    for(const seg of b.segs) ctx.lineTo(b.x + seg.dx, seg.y);
    ctx.stroke();
    ctx.restore();
  }

  // ESMAT
  if(esmat && esmatPhase && esmatPhase !== 'wow' && esmatPhase !== 'best' && esmatPhase !== 'calm'
      && esmatPhase !== 'win1' && esmatPhase !== 'win2' && esmatPhase !== 'winGlitch' && esmatPhase !== 'winBlack'){
    ctx.save();
    ctx.translate(esmat.x, esmat.y);
    if(esmat.driftLean) ctx.rotate(esmat.driftLean * 0.35);
    if(esmatImg && esmatImg.complete && esmatImg.naturalWidth > 0){
      ctx.drawImage(esmatImg, -esmat.w/2, -esmat.h/2, esmat.w, esmat.h);
    } else {
      ctx.fillStyle = '#1a1a1e';
      ctx.beginPath(); ctx.roundRect(-esmat.w/2, -esmat.h/2, esmat.w, esmat.h, 8); ctx.fill();
      ctx.fillStyle = '#c8c8d0';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICÍA', 0, esmat.h*0.28);
      ctx.fillText('489', 0, esmat.h*0.38);
    }
    ctx.restore();

    // chorro de agua dirigido
    if(esmatWaterTimer > 0){
      const aimX = esmat.waterAimX != null ? esmat.waterAimX : playerX;
      const aimY = esmat.waterAimY != null ? esmat.waterAimY : PLAYER_Y;
      const sx = esmat.x, sy = esmat.y + (esmatFrontMode ? esmat.h*0.25 : -esmat.h*0.25);
      const dx = aimX - sx, dy = aimY - sy;
      const steps = 18;
      ctx.save();
      for(let i=0;i<steps;i++){
        const t = i / steps;
        const px = sx + dx * t + Math.sin(performance.now()/40 + i)*4;
        const py = sy + dy * t;
        const r = 3 + t * 8;
        ctx.globalAlpha = 0.55 * (1 - t * 0.5);
        ctx.fillStyle = i%2 ? '#8ad8ff' : '#c8f0ff';
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#a0e0ff';
      for(let i=0;i<10;i++){
        const ang = (performance.now()/80 + i) * 0.8;
        ctx.beginPath();
        ctx.arc(aimX + Math.cos(ang)*18, aimY + Math.sin(ang)*12, 3, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    if(esmatPhase === 'fight'){
      const barW = Math.min(180, W*0.5), barH = 12;
      const x = W/2 - barW/2, y = 10;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.roundRect(x-2,y-2,barW+4,barH+4,5); ctx.fill();
      ctx.fillStyle = '#1a1020'; ctx.fillRect(x,y,barW,barH);
      const pct = Math.max(0, esmatHP/esmatMaxHP);
      ctx.fillStyle = pct > 0.4 ? '#c0a040' : '#ff4060';
      ctx.fillRect(x,y,barW*pct,barH);
      ctx.fillStyle = '#ffe0a0';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️ E.S.M.A.T '+Math.ceil(esmatHP)+'/'+esmatMaxHP, W/2, y-4);
      ctx.textAlign = 'left';
      ctx.fillStyle = reloadTimer>0 ? '#ffaa60' : '#a0ffc0';
      ctx.font = 'bold 11px sans-serif';
      if(reloadTimer>0) ctx.fillText('RECARGA '+reloadTimer.toFixed(1)+'s', 12, H-38);
      else ctx.fillText('🔫 '+playerAmmo+'/30', 12, H-38);
      if(playerRamShield > 0){
        ctx.fillStyle = '#60e0ff';
        ctx.fillText('🛡️ ESCUDOS '+playerRamShield.toFixed(1)+'s', 12, H-54);
      }
      if(phase3Apocalypse){
        ctx.fillStyle = '#ff6040';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('☢ APOCALIPSIS', W-12, H-38);
      }
    }
  }

  // ceguera agua
  if(esmatWaterBlind > 0){
    ctx.save();
    const pct = Math.min(1, esmatWaterBlind / 5);
    const a = 0.28 + 0.32 * pct;
    const g = ctx.createRadialGradient(W/2, H/2, H*0.1, W/2, H/2, H*0.75);
    g.addColorStop(0, 'rgba(40,120,200,'+(a*0.35)+')');
    g.addColorStop(0.55, 'rgba(20,70,140,'+a+')');
    g.addColorStop(1, 'rgba(5,20,50,'+(a*1.1)+')');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);
    const t = performance.now();
    for(let i=0;i<40;i++){
      const gx = (t*0.15 + i*61) % W;
      const gy = (t*0.45 + i*47) % H;
      ctx.globalAlpha = 0.25 + 0.35 * pct * ((i%3)/3);
      ctx.fillStyle = '#d0f0ff';
      ctx.fillRect(gx, gy, 2 + (i%3), 8 + (i%5)*2);
    }
    ctx.globalAlpha = 0.12 * pct;
    ctx.fillStyle = '#9ed8ff';
    for(let y=0;y<H;y+=6) ctx.fillRect(0, y, W, 2);
    ctx.restore();
  }

  // diálogo
  if(esmatDialogue){
    ctx.save();
    const fade = Math.min(esmatDialogue.t, 0.8, Math.max(0.1, esmatDialogue.max - esmatDialogue.t));
    ctx.globalAlpha = Math.max(0.25, Math.min(1, fade * 1.5));
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(W*0.06, H*0.34, W*0.88, 78);
    ctx.strokeStyle = esmatDialogue.who === 'player' ? '#7dffb0' : '#ffd060';
    ctx.lineWidth = 2;
    ctx.strokeRect(W*0.06, H*0.34, W*0.88, 78);
    ctx.fillStyle = esmatDialogue.who === 'player' ? '#7dffb0' : '#ffd060';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    const words = esmatDialogue.text.split(' ');
    let line = '', linesArr = [], maxW = W*0.8;
    for(const w of words){
      const test = line ? line+' '+w : w;
      if(ctx.measureText(test).width > maxW){ linesArr.push(line); line = w; }
      else line = test;
    }
    if(line) linesArr.push(line);
    linesArr.forEach((ln, idx) => ctx.fillText(ln, W/2, H*0.34 + 34 + idx*18));
    ctx.restore();
  }

  // escudos laterales jugador
  if(playerRamShield > 0 && esmatPhase === 'fight'){
    ctx.save();
    ctx.translate(playerX, PLAYER_Y);
    const pulse = 0.7 + 0.3*Math.sin(performance.now()/90);
    for(const side of [-1, 1]){
      const x = side * 34;
      ctx.globalAlpha = pulse;
      const grd = ctx.createLinearGradient(x-8, 0, x+8, 0);
      grd.addColorStop(0, '#1a6080');
      grd.addColorStop(0.5, '#60e8ff');
      grd.addColorStop(1, '#1a6080');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.roundRect(x - 7, -48, 14, 96, 4);
      ctx.fill();
      ctx.strokeStyle = '#c0ffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#e0ffff';
      for(let i=0;i<5;i++){
        ctx.beginPath();
        ctx.arc(x, -40 + i*18, 2.2, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.25 * pulse;
      ctx.fillStyle = '#40d0ff';
      ctx.beginPath();
      ctx.ellipse(x, 0, 16, 55, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  // modo prueba
  if(GOD_MODE){
    ctx.save();
    ctx.fillStyle = 'rgba(255,220,40,0.95)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('⚡ MODO PRUEBA (W)', W - 12, 24);
    ctx.restore();
  }

  // victoria: interferencia
  if(esmatPhase === 'winGlitch'){
    ctx.save();
    const t = performance.now();
    for(let i=0;i<14;i++){
      const y = ((t*0.2 + i*47) % H);
      const h = 2 + (i%4);
      ctx.globalAlpha = 0.15 + 0.25*Math.random();
      ctx.fillStyle = i%2 ? '#0f0' : '#0ff';
      ctx.fillRect(0, y, W, h);
      if(i%3===0){
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.08;
        ctx.fillRect(Math.random()*W*0.7, Math.random()*H, 40+Math.random()*80, 8+Math.random()*20);
      }
    }
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#fff';
    for(let x=0;x<W;x+=3){
      if(Math.random()<0.15) ctx.fillRect(x, Math.random()*H, 2, 1);
    }
    ctx.restore();
  }

  // victoria: pantalla negra WIN
  if(esmatPhase === 'winBlack'){
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,W,H);
    const pulse = 0.7 + 0.3*Math.sin(performance.now()/200);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffe040';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WIN', W/2, H/2);
    ctx.globalAlpha = 0.6;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Volviendo al menú...', W/2, H/2 + 50);
    ctx.restore();
  }
}

function drawHealthBar(){
  const barW=Math.min(160,W*0.4), barH=12;
  const x=12, y=H-22;
  ctx.fillStyle='rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.roundRect(x-2,y-2,barW+4,barH+4,5); ctx.fill();
  ctx.fillStyle='#2a1010';
  ctx.fillRect(x,y,barW,barH);
  const pct=Math.max(0,health/100);
  const col=pct>0.5?'#40e070':(pct>0.25?'#e0c040':'#e04040');
  ctx.fillStyle=col;
  ctx.fillRect(x,y,barW*pct,barH);
  ctx.fillStyle='#fff';
  ctx.font='bold 10px sans-serif';
  ctx.textAlign='left';
  ctx.fillText('❤ '+Math.ceil(health), x+4, y-4);
}
function triggerHealthDeath(){
  if(!running) return;
  running=false; paused=false; crashAnim=true; crashT=0; shake=18;
  setPauseUI(false);
  stopEngine(); stopMusic(); stopSiren(); playCrash();
  setTimeout(()=>playGameOverMusic(), 350);
  crashOther=null;
  spawnCrashParticles(playerX, PLAYER_Y-20, 40);
  last=performance.now(); requestAnimationFrame(frame);
}

function updateLaneChanges(dt){
  if(score<120) return;
  const chanceBoost=Math.min(0.5,(score-120)/400);
  for(const car of traffic){
    if(!car.canLC||car.crashed) continue;
    if(car.changing){
      car.changeT+=dt; const dur=0.5; const t=Math.min(1,car.changeT/dur);
      const ease=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      car.x=car.fromX+(lanes[car.targetLane]-car.fromX)*ease; car.lane=car.targetLane;
      if(t>=1){car.changing=false;car.x=lanes[car.targetLane];car.changeCooldown=1.8+Math.random()*2.5-chanceBoost}
      continue;
    }
    car.changeCooldown-=dt;
    if(car.changeCooldown>0) continue;
    // solo cambian de carril DELANTE del jugador (no a su lado ni atrás)
    const aheadMin = 70;
    const aheadMax = PLAYER_Y - 140; // margen claro por delante del carro principal
    if(car.y < aheadMin || car.y > aheadMax){ car.changeCooldown=0.5; continue; }
    const options=[]; if(car.lane>0) options.push(car.lane-1); if(car.lane<2) options.push(car.lane+1);
    const candidates=options.filter(nl=>!traffic.some(o=>o!==car&&(o.lane===nl||o.targetLane===nl)&&Math.abs(o.y-car.y)<car.h+45));
    if(!candidates.length){car.changeCooldown=1;continue}
    if(Math.random()>0.55+chanceBoost){car.changeCooldown=0.8;continue}
    car.targetLane=candidates[Math.floor(Math.random()*candidates.length)];
    car.fromX=car.x; car.changing=true; car.changeT=0;
  }
}

function frame(t){
  if((!running&&!crashAnim) || paused) return;
  let dt=Math.min((t-last)/1000||0,.04); last=t;

  if(crashAnim){
    crashT+=dt; shake=Math.max(0,18-crashT*12); updateParticles(dt);
    if(crashOther){ crashOther.x+=crashOther.crashVx*dt; crashOther.y+=crashOther.crashVy*dt; crashOther.crashVy+=180*dt; crashOther.crashAngle+=crashOther.crashSpin*dt; crashOther.scale=Math.max(0.4,1-crashT*0.35); }
    road();
    const sx=(Math.random()-0.5)*shake*2, sy=(Math.random()-0.5)*shake*2;
    ctx.save(); ctx.translate(sx,sy);
    traffic.forEach(car=>{ if(car===crashOther) return; car.y+=(speed*.35)*dt; drawTrafficCar(car); });
    if(crashOther) drawTrafficCar(crashOther, crashOther.crashAngle, crashOther.scale);
    const pAng=crashT*7.5+Math.sin(crashT*14)*0.3;
    const pScale=Math.max(0.25,1-crashT*0.55);
    const pOy=-crashT*110+Math.sin(crashT*10)*8;
    const pOx=Math.sin(crashT*9)*25;
    drawPlayer(pAng, pScale, pOx, pOy);
    ctx.restore(); drawParticles();
    if(crashT<0.15){ ctx.fillStyle=`rgba(255,220,180,${0.7-crashT*4})`; ctx.fillRect(0,0,W,H); }
    if(crashT>0.2&&crashT<0.35){ ctx.fillStyle=`rgba(255,100,50,${0.25-(crashT-0.2)*1.5})`; ctx.fillRect(0,0,W,H); }
    if(crashT>1.7){ crashAnim=false; showGameOver(); return; }
    requestAnimationFrame(frame); return;
  }

  roadOffset=(roadOffset+speed*dt)%1000;
  ambientScroll+=speed*dt; // scroll lateral continuo (sin salto)
  score+=dt*10; speed=260+Math.min(score*1.1,180);
  updateRoadGeometry();
  const apoc=getApoc();
  const storm=getStorm();
  let quake=0;
  if(apoc>0){
    quake=2.5+apoc*7+(Math.sin(performance.now()/90)*apoc*3);
    shake=Math.max(shake,quake);
  }
  if(storm>0 || apoc>0){
    traffic.forEach(car=>{
      if(!car.changing && !car.crashed && typeof car.lane==='number'){
        car.x += (lanes[car.lane]-car.x)*Math.min(1,4*dt);
      }
    });
  }
  spawn+=dt; {
  const blockTraffic = (gameMode==='chase' && (
    (fightPhase && fightPhase!=='done') ||
    (esmatPhase && esmatPhase!=='calm')
  ));
  if(!blockTraffic && spawn>Math.max(.62,1.28-score/200)){addTraffic();spawn=0}
}
  if(((frame._tick=(frame._tick|0)+1)%3)===0) updateEngine(speed);
  updateLaneChanges(dt); updatePowerUps(dt); updateParticles(dt); updateStorm(dt); updateMeteors(dt);

  const dx=playerTargetX-playerX;
  if(Math.abs(dx)>0.5) playerX+=dx*Math.min(1,14*dt); else playerX=playerTargetX;

  road();
  const sx=(Math.random()-0.5)*shake, sy=(Math.random()-0.5)*shake;
  if(shake>0){if(apoc<=0)shake=Math.max(0,shake-dt*40);else shake=Math.max(quake*0.55,shake-dt*25);ctx.save();ctx.translate(sx,sy)}
  const lean=Math.max(-0.18,Math.min(0.18,(playerTargetX-playerX)*0.004));
  traffic.forEach(car=>{
    if(!car.crashed) car.y+=(speed*.70+car.speed*.16)*dt;
    // los de rampa se dibujan después del jugador (pasan por encima)
    if(!(car.rampLaunch && car.crashed)){
      drawTrafficCar(car, car.crashed?car.crashAngle:0, car.scale||1);
    }
    if(!car.crashed && collide({x:playerX,y:PLAYER_Y,w:58,h:112},car)){
      if(powerActive && powerType==='shield'){
        car.crashed=true;
        car.crashVx=(car.x>=playerX?1:-1)*(140+Math.random()*80);
        car.crashVy=-100-Math.random()*50;
        car.crashSpin=(car.x>=playerX?1:-1)*(5+Math.random()*4);
        car.crashAngle=0;
        spawnCrashParticles(car.x, car.y, 30);
        shake=Math.max(shake, 6);
        playCrash();
      } else if(powerActive && powerType==='ramp'){
        launchWithRamp(car);
      } else if(powerActive && powerType==='ghost'){
        // atraviesa
      } else {
        triggerCrash(car);
      }
    }
  });
  // coches embestidos / lanzados por rampa
  traffic.forEach(car=>{
    if(car.crashed && !crashAnim){
      car.x+=car.crashVx*dt;
      car.y+=car.crashVy*dt;
      if(car.rampLaunch){
        car.rampT=(car.rampT||0)+dt;
        // gravedad más suave al inicio → arco alto por encima del jugador
        const g = car.rampT < 0.35 ? 180 : 380;
        car.crashVy+=g*dt;
        car.crashAngle+=car.crashSpin*dt;
        // crece al pasar por encima, luego se aleja
        if(car.rampT < 0.45) car.scale=Math.min(1.45, 1+car.rampT*1.1);
        else car.scale=Math.max(0.2, car.scale-dt*0.7);
        car.crashVx*=(1-0.15*dt);
      } else {
        car.crashVy+=200*dt;
        car.crashAngle+=car.crashSpin*dt;
        car.scale=Math.max(0.2,(car.scale||1)-dt*1.2);
      }
    }
  });
  traffic=traffic.filter(v=>v.y<H+180 && v.y>-280 && !(v.crashed && (v.scale||1)<0.18 && (v.rampT||0)>0.6));

  updateChase(dt);

  // dibujar tráfico normal (sin los de rampa en vuelo)
  // ya se dibujaron arriba; re-dibujar solo los de rampa DESPUÉS del jugador
  powerUps.forEach(drawPowerUp);
  if(powerActive && powerType==='ghost'){
    ctx.globalAlpha = 0.35 + 0.15*Math.sin(performance.now()/100);
    drawPlayer(lean);
    ctx.globalAlpha = 1;
  } else {
    drawPlayer(lean);
  }
  drawPlayerShield();
  drawGunBullets();
  // coches lanzados por rampa: encima del jugador (pasan volando)
  traffic.forEach(car=>{
    if(car.rampLaunch && car.crashed){
      const ang = car.crashAngle + (car.tiltZ||0)*0.4;
      drawTrafficCar(car, ang, car.scale||1);
    }
  });
  try{ drawChase(); }catch(e){ console.warn('drawChase', e); }
  drawPowerHUD();
  drawParticles();
  drawStorm();
  drawMeteors();
  if(shake>0) ctx.restore();
  const sc=Math.floor(score);
  if(sc!==(frame._lastSc|0)){frame._lastSc=sc;scoreEl.textContent=sc}
  if(running) requestAnimationFrame(frame);
}

function triggerCrash(other){
  if(GOD_MODE) return;
  if(!running) return;
  running=false; paused=false; crashAnim=true; crashT=0; shake=20;
  setPauseUI(false);
  stopEngine(); stopMusic(); stopSiren(); playCrash();
  setTimeout(()=>playGameOverMusic(), 350);
  crashOther=other; other.crashed=true;
  const dir=other.x>=playerX?1:-1;
  other.crashVx=dir*(120+Math.random()*80); other.crashVy=-80-Math.random()*60;
  other.crashSpin=dir*(4+Math.random()*5); other.crashAngle=0; other.scale=1;
  spawnCrashParticles(playerX, PLAYER_Y-30,55); spawnCrashParticles(other.x,other.y,30);
  last=performance.now(); requestAnimationFrame(frame);
}


function showMainMenu(){
  const m = getMap();
  // Mostrar el récord del modo clásico por defecto en el menú
  best = bestClassic;
  if (bestEl) bestEl.textContent = best;
  if (scoreEl) scoreEl.textContent = '0';
  overlay.innerHTML = `<div class="panel">
    <div class="eyebrow">JUEGO DE CONDUCCIÓN</div>
    <h1>CARRETERA<br>EXTREMA</h1>
    <p class="maplabel">Mapa actual: ${m.icon} ${m.name}</p>
    <div class="modebtns">
      <button class="mainbtn" id="btnSelectMap">🗺️ SELECCIONAR MAPA</button>
      <button class="mainbtn chase" id="btnPlayMenu">▶ JUGAR</button>
    </div>
    <p class="hint">Elige un mapa y luego el modo de juego.</p>
  </div>`;
  overlay.style.display = 'flex';
  const b1 = document.getElementById('btnSelectMap');
  const b2 = document.getElementById('btnPlayMenu');
  if(b1) b1.onclick = function(e){ e.preventDefault(); e.stopPropagation(); showMapSelect(); };
  if(b2) b2.onclick = function(e){ e.preventDefault(); e.stopPropagation(); showModeSelect(); };
}
function showMapSelect(){
  let cards = '';
  for(const id in MAPS){
    const m = MAPS[id];
    const sel = (id === selectedMap) ? ' selected' : '';
    cards += `<button class="mapcard${sel}" data-map="${id}"><span class="mapico">${m.icon}</span><span class="mapname">${m.name}</span></button>`;
  }
  overlay.innerHTML = `<div class="panel">
    <div class="eyebrow">MAPAS</div>
    <h1>SELECCIONA<br>UN MAPA</h1>
    <div class="mapgrid">${cards}</div>
    <button class="backbtn" id="btnBackMain">← Volver</button>
    <p class="hint">Toca un mapa para seleccionarlo.</p>
  </div>`;
  overlay.style.display = 'flex';
  overlay.querySelectorAll('.mapcard').forEach(btn=>{
    btn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      setSelectedMap(btn.getAttribute('data-map'));
      showMapSelect();
    };
  });
  const back = document.getElementById('btnBackMain');
  if(back) back.onclick = function(e){ e.preventDefault(); showMainMenu(); };
}


function showModeSelect(){
  const m = getMap();
  overlay.innerHTML=`<div class="panel"><div class="eyebrow">JUGAR</div><h1>MODO DE<br>JUEGO</h1><p class="maplabel">${m.icon} ${m.name}</p><div class="modebtns"><button class="mainbtn" id="playClassic">▶ CLÁSICO</button><button class="mainbtn chase" id="playChase">🚔 PERSECUCIÓN</button></div><button class="backbtn" id="btnBackMain2">← Volver</button><p class="hint">Clásico: esquiva tráfico.<br>Persecución: la policía te dispara.</p></div>`;
  overlay.style.display='flex';
  bindPlayBtn();
  const back=document.getElementById('btnBackMain2');
  if(back) back.onclick=function(e){e.preventDefault();e.stopPropagation();showMainMenu();};
}
function showGameOver(){
  over=true; paused=false; setPauseUI(false);
  let final=Math.floor(score);
  if(gameMode==='chase'){
    if(final>bestChase){bestChase=final;localStorage.setItem('carreteraBestChase',bestChase)}
    best=bestChase;
  } else {
    if(final>bestClassic){bestClassic=final;localStorage.setItem('carreteraBest',bestClassic)}
    best=bestClassic;
  }
  if (bestEl) bestEl.textContent = best;
  const modeLabel = gameMode==='chase' ? 'PERSECUCIÓN' : 'CLÁSICO';
  const reason = (gameMode==='chase' && health<=0) ? '¡SIN VIDA!' : '¡CHOQUE!';
  overlay.innerHTML=`<div class="panel"><div class="eyebrow">${modeLabel}</div><h1>${reason}</h1><p>Tu puntuación: <b>${final}</b><br>Récord ${modeLabel}: <b>${best}</b></p><div class="modebtns"><button class="mainbtn" id="btnMenu">🏠 MENÚ</button><button class="mainbtn" id="againClassic">↻ CLÁSICO</button><button class="mainbtn chase" id="againChase">↻ PERSECUCIÓN</button></div><p class="hint">Cada modo tiene su propio récord.</p></div>`;
  overlay.style.display='flex';
  bindPlayBtn();
  const bm=document.getElementById('btnMenu');
  if(bm) bm.onclick=function(e){e.preventDefault();e.stopPropagation();showMainMenu();};
  road(); traffic.forEach(v=>{ if(v!==crashOther) drawTrafficCar(v); });
  if(crashOther) drawTrafficCar(crashOther, crashOther.crashAngle, crashOther.scale);
  drawParticles();
}
function start(mode){
  if(mode==='chase' || mode==='classic') gameMode=mode;
  try{ resumeAudio(); }catch(e){}
  try{ ensureSprites(); }catch(e){ console.warn('sprites',e); }
  layout();
  score=0;speed=260;spawn=0;roadOffset=0;ambientScroll=0;traffic=[];particles=[];
  lane=1;playerX=lanes[lane];playerTargetX=playerX;
  over=false;running=true;paused=false;crashAnim=false;crashT=0;shake=0;crashOther=null;powerUps=[];powerTimer=0;powerActive=false;powerType=null;powerSpawn=POWER.spawnStart;gunBullets=[];gunFireTimer=0;
  rainDrops=[];lightningTimer=1.5;lightningFlash=0;lightningBolts=[];
  resetMeteors();
  resetChase();
  best = (gameMode==='chase' ? bestChase : bestClassic);
  if (scoreEl) scoreEl.textContent = '0';
  if (bestEl) bestEl.textContent = best;
  overlay.style.display='none'; setPauseUI(false); last=performance.now();
  startEngine(); startMusic(); requestAnimationFrame(frame);
}
function move(d){ if(!running||paused) return; lane=Math.max(0,Math.min(2,lane+d)); playerTargetX=lanes[lane]; }
function bindPlayBtn(){
  const classic=document.getElementById('playClassic')||document.getElementById('againClassic');
  if(classic) classic.onclick=function(e){e.preventDefault();start('classic')};
  const chase=document.getElementById('playChase')||document.getElementById('againChase');
  if(chase) chase.onclick=function(e){e.preventDefault();start('chase')};
  const again=document.getElementById('again');
  if(again) again.onclick=function(e){e.preventDefault();start(gameMode||'classic')};
  const play=document.getElementById('play');
  if(play) play.onclick=function(e){e.preventDefault();start('classic')};
}



/* ===== API pública ===== */
export {
  layout,
  start,
  move,
  showMainMenu,
  showMapSelect,
  showModeSelect,
  showGameOver,
  togglePause,
  bindPlayBtn,
  playerShoot,
  resumeAudio,
  toggleMusicMute,
  toggleSfxMute,
  updateMuteUI,
  ensureSprites,
  road,
  drawPlayer,
  isDesktop,
};
export function getRunning() { return running; }
export function getPaused() { return paused; }
export function getGameMode() { return gameMode; }
export function getScore() { return score; }
export function toggleGodMode(){
  pullChaseState();
  const v = _toggleGodMode();
  GOD_MODE = chase.godMode;
  return v;
}
export function getGodMode(){ return chase.godMode; }
