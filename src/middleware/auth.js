'use strict';

const { pool } = require('../db/pool');
const authRepo = require('../modules/auth/auth.repo');

// Adjunta req.staff a partir de la cookie de sesión (o null). Global: corre en
// cada request. Solo consulta la DB si hay cookie (rutas públicas no pagan costo).
async function attachStaff(req, res, next) {
  try {
    const token = req.cookies && req.cookies.session_token;
    req.staff = token ? await authRepo.getStaffBySession(pool, token) : null;
  } catch (e) {
    req.staff = null;
  }
  next();
}

// Guards para API (responden JSON).
function requireStaff(req, res, next) {
  if (!req.staff) return res.status(401).json({ error: 'Debes iniciar sesión como cajero.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.staff || !['admin', 'superadmin'].includes(req.staff.role)) {
    return res.status(401).json({ error: 'Debes iniciar sesión como administrador.' });
  }
  next();
}
function requireSuperAdmin(req, res, next) {
  if (!req.staff || req.staff.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acceso restringido al administrador principal.' });
  }
  next();
}

// Guard para páginas HTML: redirige a /login en vez de responder JSON.
function requireAuthPage(roles) {
  return (req, res, next) => {
    if (!req.staff || (roles && !roles.includes(req.staff.role))) {
      return res.redirect('/login');
    }
    next();
  };
}

module.exports = {
  attachStaff,
  requireStaff,
  requireAdmin,
  requireSuperAdmin,
  requireAuthPage,
};
