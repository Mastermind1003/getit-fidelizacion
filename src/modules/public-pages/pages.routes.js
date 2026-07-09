'use strict';

const express = require('express');
const { pool } = require('../../db/pool');
const { BASE_URL } = require('../../config');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuthPage } = require('../../middleware/auth');
const { qrDataUrl } = require('../../lib/qr');

const cardsRepo = require('../cards/cards.repo');
const configService = require('../admin/config.service');
const programsService = require('../programs/programs.service');

const loginView = require('../../views/login');
const registroView = require('../../views/registro');
const miTarjetaView = require('../../views/mi-tarjeta');
const cardView = require('../../views/card');
const cajaView = require('../../views/caja');
const adminView = require('../../views/admin');
const qrPosterView = require('../../views/qr-poster');
const terminosView = require('../../views/terminos');
const manifestView = require('../../views/manifest');

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.get('/', (req, res) => res.redirect('/registro'));

// Login unificado. Si ya hay sesión, redirige (mismo criterio que el monolito).
router.get('/login', asyncHandler(async (req, res) => {
  if (req.staff) return res.redirect(req.staff.role === 'admin' ? '/admin' : '/caja');
  const cfg = await configService.getLogin();
  res.type('html').send(loginView.render(cfg));
}));

router.get('/registro', asyncHandler(async (req, res) => {
  const cfg = await configService.getRegistro();
  res.type('html').send(registroView.render(cfg));
}));

router.get('/mi-tarjeta', (req, res) => {
  res.type('html').send(miTarjetaView.render());
});

router.get('/tarjeta/:token', asyncHandler(async (req, res) => {
  const card = await cardsRepo.getByToken(pool, req.params.token);
  if (!card) return res.status(404).type('html').send('<h1>Tarjeta no encontrada</h1>');
  const cardUrl = `${BASE_URL}/tarjeta/${card.unique_token}`;
  const qr = await qrDataUrl(cardUrl, { width: 280, margin: 1 });
  res.type('html').send(cardView.render(card, qr));
}));

router.get('/caja', requireAuthPage(), asyncHandler(async (req, res) => {
  res.type('html').send(cajaView.render(req.staff));
}));

router.get('/admin', requireAuthPage(['admin', 'superadmin']), asyncHandler(async (req, res) => {
  const programs = await programsService.listPrograms();
  res.type('html').send(adminView.render(req.staff, programs));
}));

router.get('/cartel-qr', asyncHandler(async (req, res) => {
  const registroUrl = `${BASE_URL}/registro`;
  const qr = await qrDataUrl(registroUrl, { width: 400, margin: 1 });
  res.type('html').send(qrPosterView.render(qr, registroUrl));
}));

router.get('/terminos', asyncHandler(async (req, res) => {
  const cfg = await configService.getTyc();
  res.type('html').send(terminosView.render(cfg));
}));

router.get('/manifest.json', (req, res) => res.json(manifestView.render()));

module.exports = router;
