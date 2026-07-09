'use strict';

const { queryOne } = require('../../db/pool');

// Tarjeta + datos de cliente + programa (equivalente a getCardFull del monolito).
async function getByToken(executor, token) {
  return queryOne(
    executor,
    `SELECT lc.*, c.first_name, c.last_name, c.email, c.whatsapp_number, c.rut,
            lp.name AS program_name, lp.required_stamps, lp.logo_url, lp.logo_width,
            lp.primary_color, lp.secondary_color, lp.stamp_icon, lp.stamp_color, lp.stamp_size
     FROM loyalty_cards lc
     JOIN customers c ON c.id = lc.customer_id
     JOIN loyalty_programs lp ON lp.id = lc.program_id
     WHERE lc.unique_token = $1`,
    [token]
  );
}

async function getByShortCode(executor, code) {
  return queryOne(
    executor,
    `SELECT lc.*, lp.name AS program_name, lp.required_stamps
     FROM loyalty_cards lc JOIN loyalty_programs lp ON lp.id = lc.program_id
     WHERE lc.short_code = $1`,
    [code]
  );
}

async function getLatestByCustomer(executor, customerId) {
  return queryOne(
    executor,
    `SELECT lc.*, lp.name AS program_name, lp.required_stamps
     FROM loyalty_cards lc JOIN loyalty_programs lp ON lp.id = lc.program_id
     WHERE lc.customer_id = $1
     ORDER BY lc.id DESC LIMIT 1`,
    [customerId]
  );
}

async function insertCard(executor, c) {
  const r = await executor.query(
    `INSERT INTO loyalty_cards (customer_id, program_id, unique_token, short_code, current_stamps, status)
     VALUES ($1,$2,$3,$4,0,'active') RETURNING id`,
    [c.customer_id, c.program_id, c.unique_token, c.short_code]
  );
  return r.rows[0].id;
}

async function updateStampsStatus(executor, cardId, stamps, status) {
  await executor.query(
    'UPDATE loyalty_cards SET current_stamps = $1, status = $2 WHERE id = $3',
    [stamps, status, cardId]
  );
}

// GREATEST (no MAX, que en Postgres es agregado) para no bajar de 0.
async function decrementStamp(executor, cardId) {
  await executor.query(
    "UPDATE loyalty_cards SET current_stamps = GREATEST(0, current_stamps - 1), status = 'active' WHERE id = $1",
    [cardId]
  );
}

async function resetCard(executor, cardId) {
  await executor.query(
    "UPDATE loyalty_cards SET current_stamps = 0, status = 'active' WHERE id = $1",
    [cardId]
  );
}

module.exports = {
  getByToken,
  getByShortCode,
  getLatestByCustomer,
  insertCard,
  updateStampsStatus,
  decrementStamp,
  resetCard,
};
