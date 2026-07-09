'use strict';

const express = require('express');
const { asyncHandler } = require('../../middleware/errors');
const { requireAdmin } = require('../../middleware/auth');
const service = require('./data.service');

const router = express.Router();

// Nota: /api/admin/download-db (backup .db de SQLite) se eliminó — con Postgres
// la portabilidad va por backups de Supabase / pg_dump; la export de negocio
// sigue disponible en /api/admin/all-data (el frontend genera el Excel).

router.get('/api/admin/all-data', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.getAllData());
}));

router.get('/api/admin/lookup-boleta/:doc', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.lookupBoleta(req.params.doc));
}));

router.post('/api/admin/import-registry', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.importRegistry(req.staff, req.body || {}));
}));

router.get('/api/admin/registry', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.listRegistry());
}));

router.delete('/api/admin/registry', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.clearRegistry());
}));

router.post('/api/admin/import-sales', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.importSales(req.staff, req.body || {}));
}));

router.delete('/api/admin/sales-detail', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await service.clearSalesDetail());
}));

module.exports = router;
