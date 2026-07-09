'use strict';

const express = require('express');
const { asyncHandler } = require('../../middleware/errors');
const { requireAdmin } = require('../../middleware/auth');
const service = require('./customers.service');

const router = express.Router();

router.get('/api/admin/customers', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.listAdmin());
}));

router.get('/api/admin/customers/:id/detail', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.getDetail(parseInt(req.params.id, 10)));
}));

router.put('/api/admin/customers/:id', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.updateCustomer(req.staff, parseInt(req.params.id, 10), req.body || {}));
}));

router.delete('/api/admin/customers/:id', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.deleteCustomer(req.staff, parseInt(req.params.id, 10)));
}));

module.exports = router;
