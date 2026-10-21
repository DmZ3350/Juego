/**
 * Controles de teclado y táctil.
 * Se registra una sola vez desde main.js.
 */

import {
  leftBtn, rightBtn, fireBtn, fireFloatBtn,
  muteMusicBtn, muteSfxBtn, pauseBtn, resumeBtn, overlay,
} from './dom.js';
import {
  move, playerShoot, togglePause, start,
  resumeAudio, toggleMusicMute, toggleSfxMute,
  getRunning, getPaused, toggleGodMode,
} from './engine.js';

export function bindInput() {
  leftBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    move(-1);
  });
  rightBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    move(1);
  });

  [fireBtn, fireFloatBtn].forEach((el) => {
    el?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      playerShoot();
    });
  });

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) {
      e.preventDefault();
      move(-1);
    }
    // Tecla W = modo PRUEBA (invencible ON/OFF)
    if(e.key === 'w' || e.key === 'W'){
      e.preventDefault();
      toggleGodMode();
    }
    if (['ArrowRight', 'd', 'D'].includes(e.key)) {
      e.preventDefault();
      move(1);
    }
    if ((e.key === 'Enter' || e.key === ' ') && !getRunning()) {
      // start se maneja desde menús; no forzar aquí si hay overlay
    }
    if (['p', 'P', 'Escape'].includes(e.key) && getRunning()) {
      e.preventDefault();
      togglePause();
    }
    if (['x', 'X', ' ', 'Control'].includes(e.key) && getRunning() && !getPaused()) {
      if (e.key === ' ' || e.key === 'Control' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        playerShoot();
      }
    }
  });

  muteMusicBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    resumeAudio();
    toggleMusicMute();
  });
  muteSfxBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    resumeAudio();
    toggleSfxMute();
  });

  pauseBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    togglePause();
  });
  resumeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (getPaused()) togglePause();
  });

  // Clic en botones de jugar del overlay (delegación)
  overlay?.addEventListener('click', (e) => {
    const t = e.target.closest?.(
      '#playClassic, #againClassic, #playChase, #againChase, #play, #again'
    );
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    if (t.id === 'playChase' || t.id === 'againChase') start('chase');
    else start('classic');
  });

  // Desbloquear audio en primera interacción
  ['pointerdown', 'keydown'].forEach((ev) => {
    window.addEventListener(ev, () => resumeAudio(), { once: false });
  });
}

