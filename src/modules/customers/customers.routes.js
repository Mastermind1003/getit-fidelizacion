'use strict';

const express = require('express');
const { asyncHandler } = require('../../middleware/errors');
const { requireStaff } = require('../../middleware/auth');
const service = require('./customers.service');

const router = express.Router();

// Público: alta de cliente (registro).
router.post(
  '/api/customers',
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createCustomer(req.body || {}));
  })
);

// Público: búsqueda de tarjeta por RUT (página "mi-tarjeta").
router.get(
  '/api/buscar-tarjeta/:rut',
  asyncHandler(async (req, res) => {
    res.json(await service.findCardTokenByRut(req.params.rut));
  })
);

// Staff: búsqueda por RUT y por short-code (para la caja).
router.get(
  '/api/customers/by-rut/:rut',
  requireStaff,
  asyncHandler(async (req, res) => {
    res.json(await service.searchByRut(req.params.rut));
  })
);

router.get(
  '/api/customers/by-code/:code',
  requireStaff,
  asyncHandler(async (req, res) => {
    res.json(await service.searchByShortCode(req.params.code));
  })
);

module.exports = router;
