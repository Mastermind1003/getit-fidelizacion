'use strict';

const express = require('express');
const { asyncHandler } = require('../../middleware/errors');
const { requireAdmin, requireSuperAdmin } = require('../../middleware/auth');
const service = require('./programs.service');

const router = express.Router();

// GET protegidos con requireAdmin (en el monolito estaban SIN guard).
router.get(
  '/api/admin/programs',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await service.listPrograms());
  })
);

router.get(
  '/api/admin/programs/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await service.getProgram(parseInt(req.params.id, 10)));
  })
);

router.put(
  '/api/admin/programs/:id',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    res.json(await service.updateDesign(req.staff, parseInt(req.params.id, 10), req.body || {}));
  })
);

module.exports = router;
