'use strict';

const express = require('express');
const { asyncHandler } = require('../../middleware/errors');
const { requireAdmin, requireSuperAdmin } = require('../../middleware/auth');
const service = require('./config.service');

const router = express.Router();

// GET protegidos con requireAdmin (en el monolito estaban SIN guard).
// PUT restringidos a superadmin (igual que el monolito).
router.get('/api/admin/registro-config', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.getRegistro());
}));
router.put('/api/admin/registro-config', requireSuperAdmin, asyncHandler(async (req, res) => {
  res.json(await service.updateRegistro(req.body || {}));
}));

router.get('/api/admin/login-config', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.getLogin());
}));
router.put('/api/admin/login-config', requireSuperAdmin, asyncHandler(async (req, res) => {
  res.json(await service.updateLogin(req.body || {}));
}));

router.get('/api/admin/tyc-config', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.getTyc());
}));
router.put('/api/admin/tyc-config', requireSuperAdmin, asyncHandler(async (req, res) => {
  res.json(await service.updateTyc(req.body || {}));
}));

module.exports = router;
