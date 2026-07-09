'use strict';

const rateLimit = require('express-rate-limit');

// Limita intentos de login: 5 por 15 min, por IP + usuario (igual que el
// monolito, pero delegado a express-rate-limit). Reemplaza el Map en memoria.
// Nota: sigue siendo por-instancia; con multi-instancia usar un store (Redis).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const username = (req.body && req.body.username ? String(req.body.username) : '').toLowerCase();
    return `${req.ip}:${username}`;
  },
  handler: (req, res) =>
    res.status(429).json({
      error: 'Demasiados intentos fallidos. Intenta nuevamente en unos minutos.',
    }),
});

module.exports = { loginLimiter };
