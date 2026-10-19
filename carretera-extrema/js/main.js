/**
 * Punto de entrada del juego.
 * Inicializa layout, input, sprites y muestra el menú principal.
 *
 * Cómo extender:
 * 1. Mapas     → edita MAPS en js/config.js
 * 2. Constantes → js/config.js (POWER, CHASE, SPEED…)
 * 3. Estado    → js/state.js (modelo limpio para sistemas futuros)
 * 4. Lógica    → js/engine.js (motor actual) o nuevos módulos en js/systems/
 * 5. Controles → js/input.js
 * 6. DOM       → js/dom.js + index.html
 */

import { layout, showMainMenu, ensureSprites, road, drawPlayer, bindPlayBtn, updateMuteUI } from './engine.js';
import { bindInput } from './input.js';

function boot() {
  layout();
  window.addEventListener('resize', () => {
    layout();
  });

  try {
    ensureSprites();
  } catch (e) {
    console.warn('sprites', e);
  }

  bindInput();
  bindPlayBtn();
  updateMuteUI();

  try {
    road();
    drawPlayer();
  } catch (e) {
    console.warn(e);
  }

  try {
    showMainMenu();
  } catch (e) {
    console.warn(e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
