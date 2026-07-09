'use strict';

const { pool } = require('../../db/pool');
const repo = require('./config.repo');

const REGISTRO_FIELDS = [
  'logo_url', 'logo_width', 'titulo', 'subtitulo', 'bg_color', 'btn_color', 'btn_texto',
  'campo_rut', 'campo_nombre', 'campo_apellido', 'campo_correo', 'campo_telefono', 'campo_nacimiento',
  'chk1_texto', 'chk2_texto', 'tyc_texto',
];

const LOGIN_FIELDS = ['logo_url', 'logo_width', 'bg_color', 'btn_color', 'btn_texto'];

const TYC_FIELDS = [
  'logo_url', 'logo_width', 'bg_color', 'card_color', 'title_color', 'h2_color', 'text_color',
  'razon_social', 'rut', 'nombre_fantasia', 'domicilio', 'titulo', 'fecha_actualizacion',
  's1_titulo', 's1_texto', 's2_titulo', 's2_texto', 's3_titulo', 's3_texto', 's4_titulo', 's4_texto',
  's5_titulo', 's5_texto', 's6_titulo', 's6_texto', 's7_titulo', 's7_texto', 's8_titulo', 's8_texto',
];

async function getRegistro() {
  return (await repo.get(pool, 'registro_config')) || {};
}
async function getLogin() {
  return (await repo.get(pool, 'login_config')) || {};
}
async function getTyc() {
  try {
    return (await repo.get(pool, 'tyc_config')) || {};
  } catch (e) {
    return {};
  }
}

async function updateRegistro(body) {
  await repo.updateFields(pool, 'registro_config', REGISTRO_FIELDS, body);
  return { updated: true };
}
async function updateLogin(body) {
  await repo.updateFields(pool, 'login_config', LOGIN_FIELDS, body);
  return { updated: true };
}
async function updateTyc(body) {
  await repo.updateFields(pool, 'tyc_config', TYC_FIELDS, body);
  return { updated: true };
}

// Getters directos (usados también por las vistas SSR).
async function raw(table) {
  return (await repo.get(pool, table)) || {};
}

module.exports = {
  getRegistro, getLogin, getTyc,
  updateRegistro, updateLogin, updateTyc,
  raw,
  REGISTRO_FIELDS, LOGIN_FIELDS, TYC_FIELDS,
};
