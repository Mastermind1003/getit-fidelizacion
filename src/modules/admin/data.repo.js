'use strict';

const { queryOne, queryAll } = require('../../db/pool');
const { normalizeRut } = require('../../lib/rut');

const CHUNK = 500;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// INSERT multi-fila en lotes (reemplaza el N+1 del monolito). `columns` es una
// whitelist fija; los valores van parametrizados ($n).
async function bulkInsert(executor, table, columns, rowsValues) {
  const ncols = columns.length;
  for (const group of chunk(rowsValues, CHUNK)) {
    const placeholders = group
      .map((row, r) => '(' + row.map((_, c) => `$${r * ncols + c + 1}`).join(',') + ')')
      .join(', ');
    await executor.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`,
      group.flat()
    );
  }
}

// ---- Export ----
const allCustomers   = (ex) => queryAll(ex, 'SELECT * FROM customers ORDER BY id');
const allPurchases   = (ex) => queryAll(ex, 'SELECT * FROM purchases ORDER BY id');
const allStampEvents = (ex) => queryAll(ex, 'SELECT * FROM stamp_events ORDER BY id');
const allCards       = (ex) => queryAll(ex, 'SELECT * FROM loyalty_cards ORDER BY id');
const allSalesDetail = (ex) => queryAll(ex, 'SELECT * FROM sales_detail ORDER BY id');
const allRedemptions = (ex) => queryAll(ex, `
  SELECT rr.*, c.rut, c.first_name, c.last_name
  FROM reward_redemptions rr
  JOIN loyalty_cards lc ON lc.id = rr.loyalty_card_id
  JOIN customers c ON c.id = lc.customer_id
  ORDER BY rr.id`);

// ---- Dashboard ----
async function dashboardStats(ex) {
  const c = async (sql) => (await queryOne(ex, sql)).c;
  const customers = await c('SELECT COUNT(*) c FROM customers');
  const activeCards = await c("SELECT COUNT(*) c FROM loyalty_cards WHERE status = 'active'");
  const completedCards = await c("SELECT COUNT(*) c FROM loyalty_cards WHERE status = 'completed'");
  const purchases = await c('SELECT COUNT(*) c FROM purchases');
  const grantedStamps = await c("SELECT COUNT(*) c FROM stamp_events WHERE type = 'grant'");
  const redemptions = await c('SELECT COUNT(*) c FROM reward_redemptions');
  const topCustomers = await queryAll(ex, `
    SELECT c.rut, c.first_name, c.last_name, COUNT(p.id) AS total_purchases
    FROM customers c JOIN purchases p ON p.customer_id = c.id
    GROUP BY c.id ORDER BY total_purchases DESC LIMIT 10`);
  return { customers, activeCards, completedCards, purchases, grantedStamps, redemptions, topCustomers };
}

// ---- Analytics de ventas (cruce registro ↔ sales_detail) ----
async function salesAnalytics(ex) {
  const totalSold = (await queryOne(ex, `
    SELECT COALESCE(SUM(sd.total_bruto), 0) AS total FROM sales_detail sd
    WHERE sd.documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)`)).total;

  // Postgres exige alias en subqueries de FROM (SQLite no) → alias "t".
  const ticketPromedio = (await queryOne(ex, `
    SELECT AVG(doc_total) AS avg_ticket FROM (
      SELECT documento, SUM(total_bruto) AS doc_total
      FROM sales_detail WHERE documento IS NOT NULL GROUP BY documento
    ) t`)).avg_ticket || 0;

  const perClient = await queryAll(ex, `
    SELECT lr.rut, MIN(lr.nombre) AS nombre,
           COALESCE(SUM(sd.total_bruto), 0) AS total_comprado,
           COUNT(DISTINCT sd.documento) AS boletas
    FROM loyalty_registry lr
    LEFT JOIN sales_detail sd ON sd.documento = lr.boleta
    WHERE lr.rut IS NOT NULL
    GROUP BY lr.rut ORDER BY total_comprado DESC LIMIT 20`);

  const topProducts = await queryAll(ex, `
    SELECT producto, SUM(cantidad) AS cantidad_total, SUM(total_bruto) AS monto_total
    FROM sales_detail
    WHERE producto IS NOT NULL AND documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)
    GROUP BY producto ORDER BY cantidad_total DESC LIMIT 10`);

  const bottomProducts = await queryAll(ex, `
    SELECT producto, SUM(cantidad) AS cantidad_total, SUM(total_bruto) AS monto_total
    FROM sales_detail
    WHERE producto IS NOT NULL AND documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)
    GROUP BY producto ORDER BY cantidad_total ASC LIMIT 10`);

  const cashierRanking = await queryAll(ex, `
    SELECT cajero, COUNT(*) AS clientes_fidelizados
    FROM loyalty_registry WHERE cajero IS NOT NULL
    GROUP BY cajero ORDER BY clientes_fidelizados DESC LIMIT 10`);

  const hourBrackets = await queryAll(ex, `
    SELECT CAST(SUBSTR(sd.hora, 1, 2) AS INTEGER) AS hora_del_dia,
           COUNT(*) AS transacciones, SUM(sd.total_bruto) AS monto
    FROM sales_detail sd
    WHERE sd.hora IS NOT NULL AND sd.documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)
    GROUP BY hora_del_dia ORDER BY hora_del_dia ASC`);

  const totalSalesRows = (await queryOne(ex, 'SELECT COUNT(*) c FROM sales_detail')).c;
  const matchedRows = (await queryOne(ex, `
    SELECT COUNT(*) c FROM sales_detail
    WHERE documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)`)).c;
  const totalRegistryRows = (await queryOne(ex, 'SELECT COUNT(*) c FROM loyalty_registry')).c;

  return {
    totalSold, ticketPromedio, perClient, topProducts, bottomProducts,
    cashierRanking, hourBrackets, totalSalesRows, matchedRows, totalRegistryRows,
  };
}

// ---- Import ----
async function insertRegistryRows(ex, rows, batch) {
  const columns = ['rut', 'nombre', 'fecha_nac', 'correo', 'boleta', 'stickers', 'dia', 'mes', 'cajero', 'import_batch'];
  const values = rows.map((row) => [
    normalizeRut(row.rut) || row.rut || null,
    row.nombre || null,
    row.fechaNac || null,
    row.correo || null,
    row.boleta != null ? String(row.boleta).trim() : null,
    row.stickers != null ? parseInt(row.stickers, 10) : null,
    row.dia != null ? parseInt(row.dia, 10) : null,
    row.mes != null ? parseInt(row.mes, 10) : null,
    row.cajero || null,
    batch,
  ]);
  if (values.length) await bulkInsert(ex, 'loyalty_registry', columns, values);
  return values.length;
}

async function insertSalesRows(ex, rows, batch) {
  const columns = ['rut', 'documento', 'fecha', 'hora', 'cajero', 'producto', 'grupo', 'cantidad', 'total_neto', 'total_bruto', 'import_batch'];
  const values = rows.map((row) => [
    normalizeRut(row.rut) || null,
    row.documento != null ? String(row.documento).trim() : null,
    row.fecha || null,
    row.hora || null,
    row.cajero || null,
    row.producto || null,
    row.grupo || null,
    row.cantidad || 0,
    row.totalNeto || 0,
    row.totalBruto || 0,
    batch,
  ]);
  if (values.length) await bulkInsert(ex, 'sales_detail', columns, values);
  return values.length;
}

// ---- Registry / sales listado y limpieza ----
const listRegistry = (ex) => queryAll(ex, 'SELECT * FROM loyalty_registry ORDER BY id DESC LIMIT 2000');
const clearRegistry = (ex) => ex.query('DELETE FROM loyalty_registry');
const clearSalesDetail = (ex) => ex.query('DELETE FROM sales_detail');
const salesByDocumento = (ex, doc) =>
  queryAll(ex, 'SELECT producto, cantidad, total_bruto, fecha, hora, cajero FROM sales_detail WHERE documento = $1', [doc]);

module.exports = {
  allCustomers, allPurchases, allStampEvents, allCards, allSalesDetail, allRedemptions,
  dashboardStats, salesAnalytics,
  insertRegistryRows, insertSalesRows,
  listRegistry, clearRegistry, clearSalesDetail, salesByDocumento,
};
