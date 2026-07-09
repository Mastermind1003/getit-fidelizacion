'use strict';

const { pool, withTransaction } = require('../../db/pool');
const repo = require('./data.repo');
const purchasesRepo = require('../purchases/purchases.repo');
const auditRepo = require('../audit/audit.repo');

async function getAllData() {
  const [customers, purchases, stampEvents, redemptions, cards, salesDetail, stats, analytics] =
    await Promise.all([
      repo.allCustomers(pool),
      repo.allPurchases(pool),
      repo.allStampEvents(pool),
      repo.allRedemptions(pool),
      repo.allCards(pool),
      repo.allSalesDetail(pool),
      repo.dashboardStats(pool),
      repo.salesAnalytics(pool),
    ]);
  return { customers, purchases, stampEvents, redemptions, cards, salesDetail, stats, analytics };
}

async function importRegistry(staff, body) {
  const rows = (body && body.rows) || [];
  const batch = new Date().toISOString();
  const inserted = await withTransaction(async (client) => {
    const n = await repo.insertRegistryRows(client, rows, batch);
    await auditRepo.logAudit(client, staff.id, 'import', 'loyalty_registry', null, null, { inserted: n });
    return n;
  });
  return { inserted };
}

async function importSales(staff, body) {
  const rows = (body && body.rows) || [];
  const batch = new Date().toISOString();
  const inserted = await withTransaction(async (client) => {
    const n = await repo.insertSalesRows(client, rows, batch);
    await auditRepo.logAudit(client, staff.id, 'import', 'sales_detail', null, null, { inserted: n });
    return n;
  });
  return { inserted };
}

async function listRegistry() {
  return repo.listRegistry(pool);
}
async function clearRegistry() {
  await repo.clearRegistry(pool);
  return { cleared: true };
}
async function clearSalesDetail() {
  await repo.clearSalesDetail(pool);
  return { cleared: true };
}

async function lookupBoleta(documento) {
  const clean = String(documento).trim();
  const rows = await repo.salesByDocumento(pool, clean);
  const alreadyUsed = await purchasesRepo.receiptExists(pool, clean);
  const total = rows.reduce((s, r) => s + (r.total_bruto || 0), 0);
  return { rows, alreadyUsed, total };
}

module.exports = {
  getAllData,
  importRegistry,
  importSales,
  listRegistry,
  clearRegistry,
  clearSalesDetail,
  lookupBoleta,
};
