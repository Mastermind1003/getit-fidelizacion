'use strict';

// OPCIONAL — migra datos de un loyalty.db (SQLite del monolito) a PostgreSQL.
// Uso:  SQLITE_DB=/ruta/loyalty.db node scripts/import-sqlite.js
//
// Requisitos:
//   - Node >= 22 (usa node:sqlite para leer el .db). Si tu Node es menor,
//     corre este script en una máquina con Node 22+.
//   - La base Postgres debe estar migrada (npm run migrate) y VACÍA de datos
//     (idealmente sin correr seed antes, para no chocar ids).
//
// Preserva los ids (OVERRIDING SYSTEM VALUE) y luego reajusta las secuencias.

const path = require('path');
const { pool, withTransaction } = require('../src/db/pool');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('Este script requiere Node >= 22 (node:sqlite). Node actual:', process.version);
  process.exit(1);
}

const SQLITE_DB = process.env.SQLITE_DB || path.join(__dirname, '..', 'loyalty.db');

// Orden respetando las FKs. `identity: true` => columna id GENERATED AS IDENTITY.
const TABLES = [
  { name: 'branches', identity: true },
  { name: 'loyalty_programs', identity: true },
  { name: 'staff_users', identity: true },
  { name: 'customers', identity: true },
  { name: 'loyalty_cards', identity: true },
  { name: 'purchases', identity: true },
  { name: 'stamp_events', identity: true },
  { name: 'rewards', identity: true },
  { name: 'reward_redemptions', identity: true },
  { name: 'audit_logs', identity: true },
  { name: 'notifications_log', identity: true },
  { name: 'sales_detail', identity: true },
  { name: 'loyalty_registry', identity: true },
  // sessions se omite (transitorio). Configs se dejan al seed.
];

async function migrateTable(client, sqlite, table) {
  const rows = sqlite.prepare(`SELECT * FROM ${table.name}`).all();
  if (!rows.length) {
    console.log(`[import] ${table.name}: 0 filas`);
    return;
  }
  const columns = Object.keys(rows[0]);
  const colList = columns.join(', ');
  const overriding = table.identity ? 'OVERRIDING SYSTEM VALUE' : '';

  for (const row of rows) {
    const values = columns.map((c) => row[c]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
    await client.query(
      `INSERT INTO ${table.name} (${colList}) ${overriding} VALUES (${placeholders})`,
      values
    );
  }

  if (table.identity) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${table.name}', 'id'),
              (SELECT COALESCE(MAX(id), 1) FROM ${table.name}))`
    );
  }
  console.log(`[import] ${table.name}: ${rows.length} filas`);
}

async function main() {
  console.log(`[import] leyendo ${SQLITE_DB}`);
  const sqlite = new DatabaseSync(SQLITE_DB, { readOnly: true });
  await withTransaction(async (client) => {
    for (const table of TABLES) {
      await migrateTable(client, sqlite, table);
    }
  });
  sqlite.close();
  console.log('[import] listo. Revisa /admin para verificar los datos.');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[import] error:', err.message);
    pool.end();
    process.exit(1);
  });
