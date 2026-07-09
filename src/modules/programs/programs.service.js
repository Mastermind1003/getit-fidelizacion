'use strict';

const { pool } = require('../../db/pool');
const { HttpError } = require('../../middleware/errors');
const repo = require('./programs.repo');
const auditRepo = require('../audit/audit.repo');

const HEX = /^#[0-9A-Fa-f]{6}$/;

async function getProgram(id) {
  const program = await repo.getById(pool, id);
  if (!program) throw new HttpError(404, 'Programa no encontrado');
  return program;
}

async function listPrograms() {
  return repo.list(pool);
}

async function updateDesign(staff, id, body) {
  const program = await repo.getById(pool, id);
  if (!program) throw new HttpError(404, 'Programa no encontrado');

  const { name, required_stamps, logo_url, logo_width, primary_color,
    secondary_color, stamp_icon, stamp_color, stamp_size } = body;

  if (required_stamps != null && (!Number.isInteger(required_stamps) || required_stamps < 1 || required_stamps > 30)) {
    throw new HttpError(400, 'required_stamps debe ser un entero entre 1 y 30.');
  }
  if (logo_width != null && (!Number.isInteger(logo_width) || logo_width < 50 || logo_width > 76)) {
    throw new HttpError(400, 'logo_width debe ser un entero entre 50 y 76.');
  }
  if (stamp_size != null && (!Number.isInteger(stamp_size) || stamp_size < 10 || stamp_size > 25)) {
    throw new HttpError(400, 'stamp_size debe ser un entero entre 10 y 25.');
  }
  if (primary_color && !HEX.test(primary_color)) throw new HttpError(400, 'primary_color debe ser un hex válido, ej. #16321f');
  if (secondary_color && !HEX.test(secondary_color)) throw new HttpError(400, 'secondary_color debe ser un hex válido, ej. #0f1115');
  if (stamp_color && !HEX.test(stamp_color)) throw new HttpError(400, 'stamp_color debe ser un hex válido, ej. #d62828');

  const updated = {
    name: name ?? program.name,
    required_stamps: required_stamps ?? program.required_stamps,
    logo_url: logo_url ?? program.logo_url,
    logo_width: logo_width ?? program.logo_width,
    primary_color: primary_color ?? program.primary_color,
    secondary_color: secondary_color ?? program.secondary_color,
    stamp_icon: stamp_icon ?? program.stamp_icon,
    stamp_color: stamp_color ?? program.stamp_color,
    stamp_size: stamp_size ?? program.stamp_size,
  };

  await repo.updateDesign(pool, id, updated);
  await auditRepo.logAudit(pool, staff.id, 'update', 'loyalty_program', id, program, updated);
  return { updated: true, program: { id: Number(id), ...updated } };
}

module.exports = { getProgram, listPrograms, updateDesign };
