/**
 * Punto de entrada del sistema de persecución.
 * Estado activo: chaseState.js
 * Lógica (update/draw): aún en engine.js
 */

export { chase, resetChaseState, toggleGodMode } from './chaseState.js';

export const CHASE_SYSTEM = {
  name: 'chase',
};

export default CHASE_SYSTEM;
