'use strict';

const app = require('./app');
const { PORT, BASE_URL, IS_PRODUCTION } = require('./config');
const { ping } = require('./db/pool');

async function start() {
  // Verifica conectividad a la DB antes de aceptar tráfico (falla rápido).
  await ping();

  const server = app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`BASE_URL: ${BASE_URL}`);
    console.log(`Panel admin:  ${BASE_URL}/admin`);
    console.log(`Registro:     ${BASE_URL}/registro`);
    console.log(`Caja:         ${BASE_URL}/caja`);

    // Conveniencia de desarrollo: abrir el navegador (opt-in con OPEN_BROWSER=true).
    // execFile con arreglo de argumentos (sin shell) — target es fijo, sin input de usuario.
    if (!IS_PRODUCTION && process.env.OPEN_BROWSER === 'true') {
      try {
        const { execFile } = require('child_process');
        const target = `http://localhost:${PORT}/admin`;
        if (process.platform === 'darwin') execFile('open', [target], () => {});
        else if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', target], () => {});
        else execFile('xdg-open', [target], () => {});
      } catch (e) { /* noop */ }
    }
  });

  return server;
}

start().catch((err) => {
  console.error('[server] no se pudo iniciar:', err.message);
  process.exit(1);
});

module.exports = { start };
