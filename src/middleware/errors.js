'use strict';

// Error con status HTTP explícito. Los servicios lo lanzan para respuestas
// controladas (400/401/403/404/409) que el errorHandler traduce a JSON.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

// Envuelve handlers async para que sus rejections lleguen al errorHandler.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  res.status(404).send('No encontrado');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Violación de UNIQUE en Postgres (fallback si un servicio no la mapeó).
  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'Registro duplicado.' });
  }
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: (err && err.message) || 'Error interno' });
}

module.exports = { HttpError, asyncHandler, notFound, errorHandler };
