'use strict';

// Aplica src/db/schema.sql contra la base configurada en DATABASE_URL.
// Idempotente (todo es CREATE TABLE/INDEX IF NOT EXISTS). Correr en el deploy:
//   npm run migrate
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');

async function migrate() {
  const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log('[migrate] aplicando schema.sql…');
  await pool.query(sql);
  console.log('[migrate] esquema aplicado correctamente.');
}

migrate()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[migrate] error:', err.message);
    pool.end();
    process.exit(1);
  });
