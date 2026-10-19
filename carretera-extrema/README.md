# Carretera Extrema — versión modular

Juego de conducción (clásico + persecución) reorganizado en módulos ES para poder extenderlo con facilidad.

## Estructura

```
carretera-extrema/
├── index.html              # HTML limpio
├── css/
│   └── style.css           # Estilos
├── assets/
│   └── sprites.js          # Imágenes (base64) exportadas
├── js/
│   ├── main.js             # Arranque
│   ├── config.js           # Constantes y MAPS (punto de extensión #1)
│   ├── state.js            # Modelo de estado limpio (para sistemas futuros)
│   ├── dom.js              # Referencias DOM
│   ├── input.js            # Teclado / táctil
│   └── engine.js           # Motor completo (lógica + render)
└── README.md
```

## Cómo ejecutar

Necesitas un servidor estático (los módulos ES no cargan con `file://`):

```bash
cd carretera-extrema
npx serve .
# o: python3 -m http.server 8080
```

Abre la URL que indique el servidor.

## Cómo extender

### 1. Añadir un mapa nuevo

Edita `js/config.js` → objeto `MAPS`:

```js
miMapa: {
  id: 'miMapa',
  name: 'Mi mapa',
  icon: '🌴',
  desc: 'Descripción',
  asphalt: ['#111', '#222', '#333', '#2a2a2a'],
  line: '#eee',
  edge: '#c9a227',
  sideL: ['#1a3a28', '#2d5a3a'],
  sideR: ['#1a3a28', '#2d5a3a'],
  sideAccent: '#3a8a5a',
  skyTop: '#0a1a28',
  skyBot: '#1a3040',
  decor: 'palm', // palm | cactus | pine | neon
},
```

### 2. Ajustar dificultad / power-ups / persecución

Todo en `js/config.js`:

- `SPEED` — velocidad base y escalado
- `POWER` — duraciones de escudo / fantasma / rampa
- `CHASE` — umbral de pelea, vida policía, munición, daños

### 3. Nuevo modo de juego

1. Añade el modo en el menú (`showModeSelect` / `showMainMenu` en `engine.js`).
2. En `start(mode)` guarda `gameMode = 'tuModo'`.
3. En `frame()` y `updateChase()` (o un nuevo `updateTuModo`) ramifica la lógica.

### 4. Nuevo power-up

1. Constante de duración en `config.js`.
2. Spawn en `spawnPowerUp` / tipo en `activatePower`.
3. Efecto en la colisión dentro de `frame()` (como escudo/rampa/fantasma).
4. HUD en `drawPowerHUD`.

### 5. Sistemas futuros (recomendado)

`js/state.js` ya define un modelo central. La evolución natural es:

```
js/systems/
  traffic.js    // spawn, lane changes, draw
  powerups.js
  chase.js
  weather.js
  particles.js
```

Cada sistema exporta `{ update(dt, state), draw(ctx, state) }` y `main`/`engine` los registra.

## API pública del motor (`engine.js`)

| Función | Uso |
|---------|-----|
| `start(mode)` | `'classic'` \| `'chase'` |
| `showMainMenu()` | Menú principal |
| `layout()` | Recalcular canvas / carriles |
| `move(-1\|1)` | Cambiar carril |
| `playerShoot()` | Disparo (persecución) |
| `togglePause()` | Pausa |

## Notas

- Los sprites pesados viven en `assets/sprites.js` (importados una vez).
- El audio es Web Audio API procedural (sin archivos externos obligatorios).
- Récords y mapa elegido se guardan en `localStorage`.
