# Sistemas (extensión futura)

Cada sistema debería exportar una interfaz uniforme:

```js
// ejemplo: js/systems/traffic.js
export const trafficSystem = {
  name: 'traffic',
  init(state) {},
  reset(state) {},
  update(dt, state) {},
  draw(ctx, state) {},
};
```

Registro desde `main.js` o un futuro `game.js`:

```js
import { trafficSystem } from './systems/traffic.js';
Game.register(trafficSystem);
```

Mientras tanto, la lógica de tráfico, power-ups, clima y persecución vive dentro de `engine.js` y se puede ir extrayendo módulo a módulo sin romper el juego.
