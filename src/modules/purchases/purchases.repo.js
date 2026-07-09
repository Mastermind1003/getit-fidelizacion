'use strict';

const { queryOne } = require('../../db/pool');

async function insertPurchase(executor, p) {
  const r = await executor.query(
    `INSERT INTO purchases (customer_id, branch_id, receipt_number, amount, category, created_by_staff_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [p.customer_id, p.branch_id, p.receipt_number, p.amount, p.category, p.staff_id]
  );
  return r.rows[0].id;
}

async function receiptExists(executor, receiptNumber) {
  const row = await queryOne(executor, 'SELECT id FROM purchases WHERE receipt_number = $1', [receiptNumber]);
  return !!row;
}

// Inserta un stamp event ('grant' o 'revoke'). Para grant, reason = null.
async function insertStamp(executor, s) {
  const r = await executor.query(
    `INSERT INTO stamp_events (loyalty_card_id, purchase_id, staff_id, branch_id, type, reason)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [s.card_id, s.purchase_id, s.staff_id, s.branch_id, s.type, s.reason ?? null]
  );
  return r.rows[0].id;
}

// 'grant' con comillas SIMPLES (en Postgres las dobles son identificador).
async function getGrantById(executor, id) {
  return queryOne(executor, "SELECT * FROM stamp_events WHERE id = $1 AND type = 'grant'", [id]);
}

module.exports = { insertPurchase, receiptExists, insertStamp, getGrantById };
