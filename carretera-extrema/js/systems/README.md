# Sistemas

| Sistema | Estado | Archivos |
|---------|--------|----------|
| chase | Estado centralizado | `chaseState.js`, `chase.js` |
| traffic / powerups / weather / particles | Pendiente | engine.js |

El estado de persecución vive en `chaseState.js` (`chase`).
Las funciones `updateChase` / `drawChase` siguen en `engine.js` y
sincronizan con `pullChaseState` / `pushChaseState`.
