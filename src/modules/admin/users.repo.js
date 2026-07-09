'use strict';

const { queryOne, queryAll } = require('../../db/pool');

async function listWithSessions(executor, now) {
  return queryAll(
    executor,
    `SELECT id, name, username, email, role, active, branch_id,
            (SELECT COUNT(*) FROM sessions
              WHERE staff_id = staff_users.id AND expires_at > $1) AS active_sessions
     FROM staff_users ORDER BY id ASC`,
    [now]
  );
}

async function getById(executor, id) {
  return queryOne(executor, 'SELECT * FROM staff_users WHERE id = $1', [id]);
}

async function insert(executor, u) {
  const r = await executor.query(
    `INSERT INTO staff_users (branch_id, name, username, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [u.branch_id, u.name, u.username, u.email, u.password_hash, u.role]
  );
  return r.rows[0].id;
}

async function updatePassword(executor, id, passwordHash) {
  await executor.query('UPDATE staff_users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
}

async function updateUser(executor, id, u) {
  await executor.query(
    'UPDATE staff_users SET name=$1, role=$2, active=$3, branch_id=$4 WHERE id=$5',
    [u.name, u.role, u.active, u.branch_id, id]
  );
}

async function remove(executor, id) {
  await executor.query('DELETE FROM staff_users WHERE id = $1', [id]);
}

async function deleteSessions(executor, staffId) {
  await executor.query('DELETE FROM sessions WHERE staff_id = $1', [staffId]);
}

module.exports = {
  listWithSessions,
  getById,
  insert,
  updatePassword,
  updateUser,
  remove,
  deleteSessions,
};
