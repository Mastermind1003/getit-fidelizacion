'use strict';

const { pool, withTransaction } = require('../../db/pool');
const { HttpError } = require('../../middleware/errors');
const cardsRepo = require('./cards.repo');
const rewardsRepo = require('../rewards/rewards.repo');
const auditRepo = require('../audit/audit.repo');

async function getCard(token) {
  const card = await cardsRepo.getByToken(pool, token);
  if (!card) throw new HttpError(404, 'Tarjeta no encontrada');
  return card;
}

async function redeem(staff, token, body) {
  const { rut } = body || {};
  if (!rut) throw new HttpError(400, 'Debes validar el RUT del cliente para canjear el premio.');

  const card = await cardsRepo.getByToken(pool, token);
  if (!card) throw new HttpError(404, 'Tarjeta no encontrada');
  if (card.status !== 'completed') {
    throw new HttpError(400, 'La tarjeta aún no completa las marcas requeridas.');
  }

  const cleanRut = rut.trim().replace(/\./g, '').toUpperCase();
  if (cleanRut !== card.rut) {
    await auditRepo.logAudit(pool, staff.id, 'redeem_rut_mismatch', 'loyalty_card', card.id,
      { expected: card.rut }, { entered: cleanRut });
    throw new HttpError(403, 'El RUT ingresado no coincide con el dueño de la tarjeta. No se puede canjear.');
  }

  const reward = await rewardsRepo.firstByProgram(pool, card.program_id);

  return withTransaction(async (client) => {
    const redemptionId = await rewardsRepo.insertRedemption(
      client, card.id, reward ? reward.id : null, staff.id || null, null
    );
    await cardsRepo.resetCard(client, card.id);
    await auditRepo.logAudit(client, staff.id, 'redeem', 'reward_redemption', redemptionId, null, { card_id: card.id });
    return { redeemed: true, reward: reward ? reward.name : 'Premio' };
  });
}

module.exports = { getCard, redeem };
