'use strict';

const express = require('express');
const { asyncHandler } = require('../../middleware/errors');
const { requireStaff } = require('../../middleware/auth');
const service = require('./cards.service');

const router = express.Router();

// Público: ver estado de una tarjeta por su token.
router.get(
  '/api/cards/:token',
  asyncHandler(async (req, res) => {
    res.json(await service.getCard(req.params.token));
  })
);

// Staff: canjear premio de una tarjeta completa.
router.post(
  '/api/cards/:token/redeem',
  requireStaff,
  asyncHandler(async (req, res) => {
    res.json(await service.redeem(req.staff, req.params.token, req.body || {}));
  })
);

module.exports = router;
