'use strict';

const { pool, withTransaction } = require('../../db/pool');
const { HttpError } = require('../../middleware/errors');
const { isValidRut } = require('../../lib/rut');
const { cardToken, generateUniqueShortCode } = require('../../lib/tokens');
const repo = require('./customers.repo');
const cardsRepo = require('../cards/cards.repo');
const auditRepo = require('../audit/audit.repo');
const notificationsRepo = require('../notifications/notifications.repo');

function validateBirthYear(birthDate, msg) {
  if (!birthDate) return;
  const yr = parseInt(String(birthDate).split('-')[0], 10);
  if (isNaN(yr) || yr < 1900 || yr > 2100) throw new HttpError(400, msg);
}

// Registro público de cliente + creación de su tarjeta (transaccional).
async function createCustomer(body) {
  const { rut, first_name, last_name, birth_date, email, whatsapp_number, program_id, boleta, marcas } = body;

  if (!rut || !first_name || !birth_date) {
    throw new HttpError(400, 'Faltan campos obligatorios: rut, first_name, birth_date');
  }
  validateBirthYear(birth_date, 'Fecha de nacimiento inválida. El año debe estar entre 1900 y 2100.');

  const cleanRut = rut.trim().replace(/\./g, '').toUpperCase();
  if (!cleanRut.startsWith('TEMP-') && !isValidRut(cleanRut)) {
    throw new HttpError(400, 'RUT inválido. Formato esperado: 12345678-9 (sin puntos, con guión).');
  }

  const cleanEmail = email || (cleanRut.replace(/[^0-9kK]/g, '').toLowerCase() + '@getit.cl');
  const numMarcas = Math.min(parseInt(marcas, 10) || 1, 10);
  const programId = program_id || 1;
  const token = cardToken();

  try {
    return await withTransaction(async (client) => {
      const customerId = await repo.insertCustomer(client, {
        rut: cleanRut,
        first_name: first_name.toUpperCase(),
        last_name: (last_name || '-').toUpperCase(),
        birth_date,
        email: cleanEmail,
        whatsapp_number: whatsapp_number || null,
      });
      const shortCode = await generateUniqueShortCode(client);
      await cardsRepo.insertCard(client, {
        customer_id: customerId,
        program_id: programId,
        unique_token: token,
        short_code: shortCode,
      });
      await auditRepo.logAudit(client, null, 'create', 'customer', customerId, null, {
        first_name, last_name, boleta, marcas: numMarcas,
      });
      const link = `/tarjeta/${token}`;
      await notificationsRepo.log(client, customerId, 'whatsapp', 'alta', `Tu tarjeta: ${link}`);

      return {
        customer_id: customerId,
        card_token: token,
        wallet_link: link,
        message: 'Cliente registrado con ' + numMarcas + ' marca(s).',
      };
    });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'RUT ya registrado.');
    throw err;
  }
}

async function updateCustomer(staff, id, body) {
  const customer = await repo.getById(pool, id);
  if (!customer) throw new HttpError(404, 'Cliente no encontrado.');

  const { rut, first_name, last_name, birth_date, email, whatsapp_number } = body;
  let cleanRut = customer.rut;
  if (rut) {
    cleanRut = rut.trim().toUpperCase();
    if (!isValidRut(cleanRut)) throw new HttpError(400, 'RUT inválido.');
  }

  const updated = {
    rut: cleanRut,
    first_name: (first_name ?? customer.first_name).toUpperCase(),
    last_name: (last_name ?? customer.last_name).toUpperCase(),
    birth_date: birth_date ?? customer.birth_date,
    email: email ?? customer.email,
    whatsapp_number: whatsapp_number ?? customer.whatsapp_number,
  };
  validateBirthYear(updated.birth_date, 'Fecha inválida. El año debe estar entre 1900 y 2100.');

  try {
    await repo.updateCustomer(pool, id, updated);
    await auditRepo.logAudit(pool, staff.id, 'update', 'customer', id, customer, updated);
    return { updated: true };
  } catch (err) {
    if (err.code === '23505') {
      throw new HttpError(409, 'Ese RUT, email o WhatsApp ya pertenece a otro cliente.');
    }
    throw err;
  }
}

async function deleteCustomer(staff, id) {
  const customer = await repo.getById(pool, id);
  if (!customer) throw new HttpError(404, 'Cliente no encontrado.');
  await withTransaction(async (client) => {
    await repo.deleteCascade(client, id);
    await auditRepo.logAudit(client, staff.id, 'delete', 'customer', id, customer, null);
  });
  return { deleted: true };
}

async function searchByRut(rut) {
  const cleanRut = String(rut).trim().replace(/\./g, '').toUpperCase();
  const customer = await repo.getByRut(pool, cleanRut);
  if (!customer) throw new HttpError(404, 'No se encontró ningún cliente con ese RUT.');
  const card = await cardsRepo.getLatestByCustomer(pool, customer.id);
  if (!card) throw new HttpError(404, 'El cliente existe pero no tiene una tarjeta activa.');
  return {
    customer: { id: customer.id, rut: customer.rut, first_name: customer.first_name, last_name: customer.last_name },
    card,
  };
}

async function searchByShortCode(code) {
  const cleanCode = String(code).trim().toUpperCase();
  const card = await cardsRepo.getByShortCode(pool, cleanCode);
  if (!card) throw new HttpError(404, 'No se encontró ninguna tarjeta con ese código.');
  const customer = await repo.getById(pool, card.customer_id);
  return {
    customer: { id: customer.id, rut: customer.rut, first_name: customer.first_name, last_name: customer.last_name },
    card,
  };
}

// Búsqueda pública por RUT (página "mi-tarjeta"): devuelve el token para redirigir.
async function findCardTokenByRut(rut) {
  const cleanRut = String(rut).trim().replace(/\./g, '').toUpperCase();
  const customer = await repo.getByRut(pool, cleanRut);
  if (!customer) {
    throw new HttpError(404, 'No encontramos ningún cliente con ese RUT. Verifica que esté escrito sin puntos y con guión (ej: 12345678-5).');
  }
  const card = await cardsRepo.getLatestByCustomer(pool, customer.id);
  if (!card) throw new HttpError(404, 'Este cliente no tiene tarjeta activa.');
  return { token: card.unique_token };
}

async function listAdmin() {
  return repo.listWithCardInfo(pool);
}

async function getDetail(id) {
  const customer = await repo.getById(pool, id);
  if (!customer) throw new HttpError(404, 'Cliente no encontrado.');
  const [purchases, topProducts, hourPattern, dayPattern] = await Promise.all([
    repo.detailPurchases(pool, id),
    repo.topProducts(pool, id),
    repo.hourPattern(pool, id),
    repo.dayPattern(pool, id),
  ]);
  return { customer, purchases, topProducts, hourPattern, dayPattern };
}

module.exports = {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  searchByRut,
  searchByShortCode,
  findCardTokenByRut,
  listAdmin,
  getDetail,
};
