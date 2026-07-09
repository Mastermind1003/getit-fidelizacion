'use strict';

const { pool, withTransaction } = require('../../db/pool');
const { HttpError } = require('../../middleware/errors');
const { makePasswordHash } = require('../../lib/password');
const repo = require('./users.repo');
const auditRepo = require('../audit/audit.repo');

const VALID_ROLES = ['cashier', 'admin', 'superadmin'];

async function list() {
  return repo.listWithSessions(pool, Date.now());
}

async function create(staff, body) {
  const { name, username, password, role, branch_id } = body;
  if (!name || !username || !password || !role) {
    throw new HttpError(400, 'Faltan campos: name, username, password, role');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new HttpError(400, 'Rol inválido. Debe ser cashier, admin o superadmin.');
  }
  if (role === 'superadmin' && staff.role !== 'superadmin') {
    throw new HttpError(403, 'Solo el administrador principal puede crear un Super Admin.');
  }
  if (password.length < 8) {
    throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  }
  const uname = username.trim().toLowerCase();
  try {
    const id = await repo.insert(pool, {
      branch_id: branch_id || 1,
      name: name.trim(),
      username: uname,
      email: `${uname}@local.app`,
      password_hash: makePasswordHash(password),
      role,
    });
    await auditRepo.logAudit(pool, staff.id, 'create', 'staff_user', id, null, { name, username: uname, role });
    return { created: true, id };
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'El nombre de usuario ya existe.');
    throw err;
  }
}

async function resetPassword(staff, id, body) {
  const { password } = body || {};
  // Política unificada a 8 caracteres (el monolito validaba <4 con mensaje de 8).
  if (!password || password.length < 8) {
    throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  }
  const target = await repo.getById(pool, id);
  if (!target) throw new HttpError(404, 'Usuario no encontrado.');
  if (target.role === 'superadmin' && staff.role !== 'superadmin') {
    throw new HttpError(403, 'No tienes permisos para cambiar la contraseña del administrador principal.');
  }
  await withTransaction(async (client) => {
    await repo.updatePassword(client, id, makePasswordHash(password));
    await repo.deleteSessions(client, id); // cierra sesiones activas
    await auditRepo.logAudit(client, staff.id, 'reset_password', 'staff_user', id, null, null);
  });
  return { updated: true };
}

async function update(staff, id, body) {
  const target = await repo.getById(pool, id);
  if (!target) throw new HttpError(404, 'Usuario no encontrado.');
  if (target.role === 'superadmin' && staff.role !== 'superadmin') {
    throw new HttpError(403, 'No tienes permisos para modificar al administrador principal.');
  }
  if (Number(id) === staff.id && body.active === 0) {
    throw new HttpError(400, 'No puedes desactivarte a ti mismo.');
  }
  const updated = {
    name: body.name ?? target.name,
    role: body.role ?? target.role,
    active: body.active ?? target.active,
    branch_id: body.branch_id ?? target.branch_id,
  };
  if (!VALID_ROLES.includes(updated.role)) throw new HttpError(400, 'Rol inválido.');

  await withTransaction(async (client) => {
    await repo.updateUser(client, id, updated);
    if (body.active === 0) await repo.deleteSessions(client, id);
    await auditRepo.logAudit(client, staff.id, 'update', 'staff_user', id, target, updated);
  });
  return { updated: true };
}

async function remove(staff, id) {
  if (Number(id) === staff.id) throw new HttpError(400, 'No puedes eliminar tu propio usuario.');
  const target = await repo.getById(pool, id);
  if (target && target.role === 'superadmin' && staff.role !== 'superadmin') {
    throw new HttpError(403, 'No tienes permisos para eliminar al administrador principal.');
  }
  if (!target) throw new HttpError(404, 'Usuario no encontrado.');
  await withTransaction(async (client) => {
    await repo.deleteSessions(client, id);
    await repo.remove(client, id);
    await auditRepo.logAudit(client, staff.id, 'delete', 'staff_user', id, target, null);
  });
  return { deleted: true };
}

module.exports = { list, create, resetPassword, update, remove };
