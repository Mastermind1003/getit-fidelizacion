'use strict';

const { queryOne } = require('../../db/pool');

// Devuelve el staff dueño de una sesión vigente (o null). `executor` = pool o client.
async function getStaffBySession(executor, token) {
  const session = await queryOne(executor, 'SELECT * FROM sessions WHERE token = $1', [token]);
  if (!session || Number(session.expires_at) < Date.now()) return null;
  return queryOne(
    executor,
    'SELECT id, name, email, role, branch_id FROM staff_users WHERE id = $1 AND active = 1',
    [session.staff_id]
  );
}

async function findActiveByUsername(executor, username) {
  return queryOne(
    executor,
    'SELECT * FROM staff_users WHERE LOWER(username) = LOWER($1) AND active = 1',
    [username]
  );
}

async function createSession(executor, token, staffId, expiresAt) {
  await executor.query(
    'INSERT INTO sessions (token, staff_id, expires_at) VALUES ($1,$2,$3)',
    [token, staffId, expiresAt]
  );
}

async function deleteSession(executor, token) {
  await executor.query('DELETE FROM sessions WHERE token = $1', [token]);
}

module.exports = { getStaffBySession, findActiveByUsername, createSession, deleteSession };
