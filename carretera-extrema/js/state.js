/**
 * Modelo de estado central del juego (para sistemas futuros).
 * Actualmente el motor usa variables propias + systems/chaseState.js
 * para persecución. Este archivo define la forma objetivo del estado
 * cuando se complete la migración a sistemas.
 */

import { MAPS, STORAGE_KEYS, POWER } from './config.js';

function loadNumber(key, fallback = 0) {
  const v = localStorage.getItem(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function loadBool(key, fallback = false) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === '1' || v === 'true';
}

export function createInitialState() {
  const selectedMap = localStorage.getItem(STORAGE_KEYS.selectedMap) || 'costa';
  return {
    // Layout (rellenado por layout)
    landscape: false,
    W: 420,
    H: 700,
    ROAD_LEFT: 0,
    ROAD_RIGHT: 0,
    ROAD_INNER_L: 0,
    ROAD_INNER_R: 0,
    lanes: [0, 0, 0],
    PLAYER_Y: 0,

    // Flujo
    running: false,
    paused: false,
    over: false,
    crashAnim: false,
    crashT: 0,
    crashOther: null,
    last: 0,

    // Jugador
    lane: 1,
    playerX: 0,
    playerTargetX: 0,
    score: 0,
    speed: 260,
    spawn: 0,
    roadOffset: 0,
    ambientScroll: 0,
    shake: 0,

    // Récords
    bestClassic: loadNumber(STORAGE_KEYS.bestClassic),
    bestChase: loadNumber(STORAGE_KEYS.bestChase),
    best: 0,

    // Mapa
    selectedMap: MAPS[selectedMap] ? selectedMap : 'costa',

    // Entidades
    traffic: [],
    particles: [],
    powerUps: [],
    powerTimer: 0,
    powerActive: false,
    powerType: null,
    powerSpawn: POWER.spawnStart,

    // Clima / eventos
    rainDrops: [],
    lightningTimer: 1.5,
    lightningFlash: 0,
    lightningBolts: [],
    meteors: [],
    meteorTimer: 2.5,

    // Modo
    gameMode: 'classic', // 'classic' | 'chase'

    // Persecución: ver systems/chaseState.js (estado activo)

    // Audio
    musicMuted: loadBool(STORAGE_KEYS.musicMuted, false),
    sfxMuted: loadBool(STORAGE_KEYS.sfxMuted, false),
  };
}

/** Estado global de la sesión (singleton, preparado para sistemas) */
export const state = createInitialState();

export function getMap() {
  return MAPS[state.selectedMap] || MAPS.costa;
}

export function setSelectedMap(id) {
  if (!MAPS[id]) return;
  state.selectedMap = id;
  localStorage.setItem(STORAGE_KEYS.selectedMap, id);
}

export function resetGameplayState() {
  state.score = 0;
  state.speed = 260;
  state.spawn = 0;
  state.roadOffset = 0;
  state.ambientScroll = 0;
  state.traffic = [];
  state.particles = [];
  state.lane = 1;
  state.playerX = state.lanes[1];
  state.playerTargetX = state.playerX;
  state.over = false;
  state.running = true;
  state.paused = false;
  state.crashAnim = false;
  state.crashT = 0;
  state.shake = 0;
  state.crashOther = null;
  state.powerUps = [];
  state.powerTimer = 0;
  state.powerActive = false;
  state.powerType = null;
  state.powerSpawn = POWER.spawnStart;
  state.rainDrops = [];
  state.lightningTimer = 1.5;
  state.lightningFlash = 0;
  state.lightningBolts = [];
  state.meteors = [];
  state.meteorTimer = 2.5;
}

export function saveBestScore() {
  const final = Math.floor(state.score);
  if (state.gameMode === 'chase') {
    if (final > state.bestChase) {
      state.bestChase = final;
      localStorage.setItem(STORAGE_KEYS.bestChase, String(final));
    }
    state.best = state.bestChase;
  } else {
    if (final > state.bestClassic) {
      state.bestClassic = final;
      localStorage.setItem(STORAGE_KEYS.bestClassic, String(final));
    }
    state.best = state.bestClassic;
  }
}
