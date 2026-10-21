/**
 * Estado mutable del sistema de persecución / ESMAT.
 * Un solo objeto para que engine (y futuros sistemas) lean/escriban
 * sin variables sueltas repartidas por el archivo.
 *
 * Uso:
 *   import { chase } from './systems/chaseState.js';
 *   chase.health -= 10;
 *   if (chase.esmatPhase === 'fight') { ... }
 */

import { CHASE } from '../config.js';

export const chase = {
  // Modo general (engine también lo usa; se sincroniza)
  

  health: 100,
  police: null,
  bullets: [],
  missiles: [],
  medkits: [],
  bulletTimer: 0,
  missileTimer: 0,
  medkitSpawn: 0,
  bulletBurstLeft: 0,
  bulletBurstGap: 0,
  chaseIntroT: 0,
  chaseIntroDone: false,
  chaseIntroProg: 0,

  fightPhase: null,
  policeHP: CHASE.policeMaxHP,
  policeMaxHP: CHASE.policeMaxHP,
  playerAmmo: CHASE.playerMaxAmmo,
  reloadTimer: 0,
  playerBullets: [],
  fightBanner: null,
  policeLaneTimer: 10,
  fightT: 0,
  actionMusic: false,
  policeDyingT: 0,
  fightRound: 0,
  fightMedkitsSpawned: 0,
  fightMissileStep: 0,
  fightMissileWait: 0,

  // ESMAT
  esmat: null,
  esmatHP: 250,
  esmatMaxHP: 250,
  esmatPhase: null,
  esmatT: 0,
  esmatLaneTimer: 4,
  esmatBulletTimer: 7,
  esmatBurstLeft: 0,
  esmatBurstGap: 0,
  esmatWaterTimer: 0,
  esmatWaterBlind: 0,
  esmatMissileStep: 0,
  esmatMissileWait: 0,
  esmatMissileCycle: 8,
  esmatRamTimer: 7,
  esmatRamActive: 0,
  esmatRamHitT: 0,
  esmatFrontMode: false,
  esmatPosTimer: 9,
  esmatDialogue: null,
  playerRamShield: 0,
  playerRamShieldCD: 7,
  playerRamHitT: 0,
  phase3Medkits: 0,
  phase3ScoreBase: 0,
  phase3Apocalypse: false,
  thunderT: 0,
  esmatBolts: [],

  godMode: false,
};

/** Reinicia todo el estado de persecución/ESMAT */
export function resetChaseState() {
  const c = chase;
  c.health = 100;
  c.police = null;
  c.bullets = [];
  c.missiles = [];
  c.medkits = [];
  c.bulletTimer = 3;
  c.missileTimer = 12;
  c.medkitSpawn = 0;
  c.bulletBurstLeft = 0;
  c.bulletBurstGap = 0;
  c.chaseIntroT = 0;
  c.chaseIntroDone = false;
  c.chaseIntroProg = 0;
  c.fightPhase = null;
  c.policeHP = CHASE.policeMaxHP;
  c.policeMaxHP = CHASE.policeMaxHP;
  c.playerAmmo = CHASE.playerMaxAmmo;
  c.reloadTimer = 0;
  c.playerBullets = [];
  c.fightBanner = null;
  c.policeLaneTimer = 10;
  c.fightT = 0;
  c.actionMusic = false;
  c.policeDyingT = 0;
  c.fightRound = 0;
  c.fightMedkitsSpawned = 0;
  c.fightMissileStep = 0;
  c.fightMissileWait = 0;

  c.esmat = null;
  c.esmatHP = 250;
  c.esmatMaxHP = 250;
  c.esmatPhase = null;
  c.esmatT = 0;
  c.esmatLaneTimer = 4;
  c.esmatBulletTimer = 7;
  c.esmatBurstLeft = 0;
  c.esmatBurstGap = 0;
  c.esmatWaterTimer = 0;
  c.esmatWaterBlind = 0;
  c.esmatMissileStep = 0;
  c.esmatMissileWait = 0;
  c.esmatMissileCycle = 8;
  c.esmatRamTimer = 7;
  c.esmatRamActive = 0;
  c.esmatRamHitT = 0;
  c.esmatFrontMode = false;
  c.esmatPosTimer = 9;
  c.esmatDialogue = null;
  c.playerRamShield = 0;
  c.playerRamShieldCD = 7;
  c.playerRamHitT = 0;
  c.phase3Medkits = 0;
  c.phase3ScoreBase = 0;
  c.phase3Apocalypse = false;
  c.thunderT = 0;
  c.esmatBolts = [];
}

export function toggleGodMode() {
  chase.godMode = !chase.godMode;
  console.log('MODO PRUEBA:', chase.godMode ? 'ON (invencible)' : 'OFF');
  return chase.godMode;
}
