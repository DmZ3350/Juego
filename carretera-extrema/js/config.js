/**
 * Configuración global del juego.
 * Aquí van constantes, mapas y parámetros fáciles de ajustar.
 */

export const CANVAS = {
  portrait: { w: 420, h: 700 },
  landscape: { w: 900, h: 520 },
};

export const ROAD = {
  leftRatio: 0.20,
  rightRatio: 0.80,
  lanePositions: [0.20, 0.50, 0.80], // relativo al ancho de la carretera
};

export const PLAYER = {
  portraitYOffset: 85,
  landscapeYOffset: 72,
  hitbox: { w: 58, h: 112 },
};

export const SPEED = {
  base: 260,
  maxBonus: 180,
  scoreFactor: 1.1,
};

export const POWER = {
  shieldDuration: 7.5,
  ghostDuration: 6.0,
  rampDuration: 6.0,
  gunsDuration: 7.0,      // armas laterales
  gunFireInterval: 5.0,   // salva (2 balas) cada 5s
  spawnStart: 4,
};

export const CHASE = {
  fightScoreThreshold: 400,
  policeMaxHP: 200,
  playerMaxAmmo: 25,
  reloadTime: 15,
  bulletDamage: 8,
  missileDamage: 17,
  playerBulletDamage: 5,
};

export const STORAGE_KEYS = {
  bestClassic: 'carreteraBest',
  bestChase: 'carreteraBestChase',
  selectedMap: 'carreteraMap',
  musicMuted: 'carreteraMusicMuted',
  sfxMuted: 'carreteraSfxMuted',
};

/** Definición de mapas — añade uno nuevo aquí y listo */
export const MAPS = {
  costa: {
    id: 'costa',
    name: 'Costa',
    icon: '🌊',
    desc: 'Carretera junto al mar',
    asphalt: ['#1a2228', '#2a3238', '#3a4248', '#343c42'],
    line: '#e8e8e0',
    edge: '#c9a227',
    sideL: ['#1a3a28', '#2d5a3a'],
    sideR: ['#1a3a28', '#2d5a3a'],
    sideAccent: '#3a8a5a',
    skyTop: '#0a1a28',
    skyBot: '#1a3040',
    decor: 'palm',
  },
  desierto: {
    id: 'desierto',
    name: 'Desierto',
    icon: '🏜️',
    desc: 'Arena y calor',
    asphalt: ['#2a2218', '#3a3228', '#4a4238', '#403830'],
    line: '#e8d8a0',
    edge: '#c87820',
    sideL: ['#c4a060', '#a88840'],
    sideR: ['#c4a060', '#a88840'],
    sideAccent: '#8a7030',
    skyTop: '#3a2818',
    skyBot: '#5a4020',
    decor: 'cactus',
  },
  nieve: {
    id: 'nieve',
    name: 'Nieve',
    icon: '❄️',
    desc: 'Montaña nevada',
    asphalt: ['#1a1e24', '#2a3038', '#3a4048', '#343840'],
    line: '#f0f4f8',
    edge: '#a0c0d8',
    sideL: ['#d8e4ec', '#b8c8d4'],
    sideR: ['#d8e4ec', '#b8c8d4'],
    sideAccent: '#8aa0b0',
    skyTop: '#1a2838',
    skyBot: '#3a4a58',
    decor: 'pine',
  },
  noche: {
    id: 'noche',
    name: 'Noche urbana',
    icon: '🌃',
    desc: 'Neón y ciudad',
    asphalt: ['#12101a', '#1e1a28', '#2a2438', '#221e30'],
    line: '#c0a0ff',
    edge: '#ff40a0',
    sideL: ['#0a0812', '#181428'],
    sideR: ['#0a0812', '#181428'],
    sideAccent: '#6030a0',
    skyTop: '#08060f',
    skyBot: '#1a1028',
    decor: 'neon',
  },
};

export const VEHICLE_TYPES = [
  { style: 'car', weight: 40 },
  { style: 'sport', weight: 20 },
  { style: 'van', weight: 15 },
  { style: 'truck', weight: 15 },
  { style: 'bus', weight: 10 },
];

export const SPRITE_COLORS = {
  car: ['#e03030', '#3060c0', '#30a050', '#c0c0c0', '#e0a020'],
  sport: ['#ff2020', '#2020ff', '#ffcc00', '#00cc88'],
  van: ['#f0f0f0', '#4060a0', '#806040'],
  truck: ['#c04020', '#305080', '#606060'],
  bus: ['#e8b020', '#d03030', '#3060a0'],
};
