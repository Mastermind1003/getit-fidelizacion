'use strict';

const { queryOne } = require('../../db/pool');

// `table` y `fields` provienen SIEMPRE de whitelists del servicio (nunca del
// usuario), por lo que la interpolación es segura. Los valores van parametrizados.
async function get(executor, table) {
  return queryOne(executor, `SELECT * FROM ${table} WHERE id = 1`);
}

async function updateFields(executor, table, fields, body) {
  const present = fields.filter((f) => body[f] !== undefined);
  if (!present.length) return;
  const sets = present.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const vals = present.map((f) => body[f]);
  await executor.query(`UPDATE ${table} SET ${sets} WHERE id = 1`, vals);
}

module.exports = { get, updateFields };
