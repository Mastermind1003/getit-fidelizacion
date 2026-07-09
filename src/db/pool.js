'use strict';

const fs = require('fs');
const { Pool, types } = require('pg');
const {
  DATABASE_URL,
  DB_SSL,
  DB_SSL_REJECT_UNAUTHORIZED,
  DB_CA_CERT,
  DB_POOL_MAX,
} = require('../config');

// ---------------------------------------------------------------------
// Type parsers: preservan la semántica JS del monolito (que usaba SQLite
// síncrono). Sin esto, node-postgres devuelve strings/Date que rompen la
// aritmética y los .slice(0,10) del frontend.
// ---------------------------------------------------------------------
// int8 / bigint  → Number  (COUNT(*) y sessions.expires_at; valores en rango seguro)
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// numeric / decimal → Number (columnas de dinero; equivale a los REAL originales)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// timestamptz / timestamp → string crudo (el frontend hace created_at.slice(0,10))
types.setTypeParser(1184, (v) => v);
types.setTypeParser(1114, (v) => v);

if (!DATABASE_URL) {
  console.warn('[db] DATABASE_URL no está definido — configúralo en .env');
}

// TLS seguro por defecto: verifica el certificado del servidor. Si se entrega
// una CA (DB_CA_CERT, p.ej. la de Supabase) se usa para validar la cadena.
function buildSslConfig() {
  if (!DB_SSL) return false;
  const ssl = { rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED };
  if (DB_CA_CERT) {
    ssl.ca = fs.readFileSync(DB_CA_CERT, 'utf8');
  }
  if (!DB_SSL_REJECT_UNAUTHORIZED) {
    console.warn('[db] TLS sin verificación de certificado (DB_SSL_REJECT_UNAUTHORIZED=false). Úsalo solo como último recurso.');
  }
  return ssl;
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: buildSslConfig(),
  max: DB_POOL_MAX,
});

pool.on('error', (err) => {
  console.error('[db] error inesperado en cliente idle:', err.message);
});

// Lectura de una fila (o null). `executor` puede ser el pool o un client de transacción.
async function queryOne(executor, text, params) {
  const r = await executor.query(text, params);
  return r.rows[0] || null;
}

// Lectura de N filas.
async function queryAll(executor, text, params) {
  const r = await executor.query(text, params);
  return r.rows;
}

// Ejecuta `fn` dentro de una transacción con un client dedicado del pool.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
    throw err;
  } finally {
    client.release();
  }
}

// Verifica conectividad al arranque (falla rápido si la DB no responde).
async function ping() {
  await pool.query('SELECT 1');
}

module.exports = { pool, queryOne, queryAll, withTransaction, ping };
