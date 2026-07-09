'use strict';

const express = require('express');
const { pool } = require('../../db/pool');
const { IS_PRODUCTION, SESSION_DURATION_MS } = require('../../config');
const { sessionToken } = require('../../lib/tokens');
const { verifyPassword } = require('../../lib/password');
const { asyncHandler, HttpError } = require('../../middleware/errors');
const { loginLimiter } = require('../../middleware/rateLimit');
const repo = require('./auth.repo');

const router = express.Router();

// Secure solo en producción (para no romper http://localhost). Consistente en
// login y logout (arregla la cookie de logout sin flags del monolito).
const cookieOpts = { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/' };

router.post(
  '/api/auth/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      throw new HttpError(400, 'Usuario y contraseña son obligatorios.');
    }
    const staff = await repo.findActiveByUsername(pool, username.trim());
    if (!staff || !verifyPassword(password, staff.password_hash)) {
      throw new HttpError(401, 'Usuario o contraseña incorrectos.');
    }
    const token = sessionToken();
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    await repo.createSession(pool, token, staff.id, expiresAt);
    res.cookie('session_token', token, { ...cookieOpts, maxAge: SESSION_DURATION_MS });
    res.json({ ok: true, staff: { id: staff.id, name: staff.name, role: staff.role } });
  })
);

router.post(
  '/api/auth/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies && req.cookies.session_token;
    if (token) await repo.deleteSession(pool, token);
    res.clearCookie('session_token', cookieOpts);
    res.json({ ok: true });
  })
);

module.exports = router;
