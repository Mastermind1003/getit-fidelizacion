'use strict';

const express = require('express');
const { asyncHandler } = require('../../middleware/errors');
const { requireAdmin } = require('../../middleware/auth');
const service = require('./users.service');

const router = express.Router();

router.get('/api/admin/users', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.list());
}));

router.post('/api/admin/users', requireAdmin, asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.staff, req.body || {}));
}));

router.put('/api/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.update(req.staff, parseInt(req.params.id, 10), req.body || {}));
}));

router.post('/api/admin/users/:id/reset-password', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.resetPassword(req.staff, parseInt(req.params.id, 10), req.body || {}));
}));

router.delete('/api/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.remove(req.staff, parseInt(req.params.id, 10)));
}));

module.exports = router;
