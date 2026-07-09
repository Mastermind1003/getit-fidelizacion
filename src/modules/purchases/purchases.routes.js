'use strict';

const express = require('express');
const { asyncHandler } = require('../../middleware/errors');
const { requireStaff } = require('../../middleware/auth');
const service = require('./purchases.service');

const router = express.Router();

// Staff: registrar compra (otorga marca).
router.post(
  '/api/purchases',
  requireStaff,
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createPurchase(req.staff, req.body || {}));
  })
);

// Staff: anular una marca por id de stamp event.
router.post(
  '/api/stamp-events/:id/revoke',
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    res.json(await service.revokeStamp(req.staff, id, req.body || {}));
  })
);

module.exports = router;
