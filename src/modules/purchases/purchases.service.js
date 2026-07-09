'use strict';

const { pool, withTransaction } = require('../../db/pool');
const { HttpError } = require('../../middleware/errors');
const repo = require('./purchases.repo');
const cardsRepo = require('../cards/cards.repo');
const auditRepo = require('../audit/audit.repo');
const notificationsRepo = require('../notifications/notifications.repo');

// Registra una compra (boleta) y otorga una marca a la tarjeta (transaccional).
async function createPurchase(staff, body) {
  const { card_token, branch_id, receipt_number } = body;
  const amount = body.amount != null ? body.amount : 0;
  const category = body.category;
  const staffId = staff.id;

  if (!card_token || !branch_id || !receipt_number) {
    throw new HttpError(400, 'Faltan campos: card_token, branch_id, receipt_number');
  }

  const card = await cardsRepo.getByToken(pool, card_token);
  if (!card) throw new HttpError(404, 'Tarjeta no encontrada');
  if (card.status !== 'active') {
    throw new HttpError(400, `Tarjeta en estado ${card.status}, no se pueden registrar más marcas.`);
  }

  try {
    return await withTransaction(async (client) => {
      const purchaseId = await repo.insertPurchase(client, {
        customer_id: card.customer_id,
        branch_id,
        receipt_number,
        amount,
        category: category || null,
        staff_id: staffId || null,
      });
      await auditRepo.logAudit(client, staffId, 'create', 'purchase', purchaseId, null, body);

      const stampId = await repo.insertStamp(client, {
        card_id: card.id,
        purchase_id: purchaseId,
        staff_id: staffId || null,
        branch_id,
        type: 'grant',
      });
      await auditRepo.logAudit(client, staffId, 'create', 'stamp_event', stampId, null, { purchase_id: purchaseId });

      const newStamps = card.current_stamps + 1;
      const newStatus = newStamps >= card.required_stamps ? 'completed' : 'active';
      await cardsRepo.updateStampsStatus(client, card.id, newStamps, newStatus);

      await notificationsRepo.log(
        client,
        card.customer_id,
        'whatsapp',
        newStatus === 'completed' ? 'premio_desbloqueado' : 'marca_nueva',
        `Ahora tienes ${newStamps}/${card.required_stamps} marcas.`
      );

      return {
        purchase_id: purchaseId,
        stamp_granted: true,
        current_stamps: newStamps,
        card_status: newStatus,
      };
    });
  } catch (err) {
    if (err.code === '23505') {
      throw new HttpError(409, 'Esa boleta ya fue registrada en esta sucursal.');
    }
    throw err;
  }
}

// Anula una marca ('grant' -> inserta 'revoke' + decrementa) transaccional.
async function revokeStamp(staff, stampId, body) {
  const { reason } = body || {};
  const staffId = staff.id;
  if (!reason) throw new HttpError(400, 'El motivo (reason) es obligatorio para anular una marca.');

  const original = await repo.getGrantById(pool, stampId);
  if (!original) throw new HttpError(404, 'Marca no encontrada o ya anulada.');

  return withTransaction(async (client) => {
    const revokeId = await repo.insertStamp(client, {
      card_id: original.loyalty_card_id,
      purchase_id: original.purchase_id,
      staff_id: staffId || null,
      branch_id: original.branch_id,
      type: 'revoke',
      reason,
    });
    await cardsRepo.decrementStamp(client, original.loyalty_card_id);
    await auditRepo.logAudit(client, staffId, 'revoke', 'stamp_event', revokeId, original, { reason });
    return { revoked: true, reason };
  });
}

module.exports = { createPurchase, revokeStamp };
