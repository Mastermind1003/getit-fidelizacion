'use strict';

const { queryOne, queryAll } = require('../../db/pool');

async function getById(executor, id) {
  return queryOne(executor, 'SELECT * FROM customers WHERE id = $1', [id]);
}

async function getByRut(executor, rut) {
  return queryOne(executor, 'SELECT * FROM customers WHERE rut = $1', [rut]);
}

async function insertCustomer(executor, c) {
  const r = await executor.query(
    `INSERT INTO customers (rut, first_name, last_name, birth_date, email, whatsapp_number)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [c.rut, c.first_name, c.last_name, c.birth_date, c.email, c.whatsapp_number]
  );
  return r.rows[0].id;
}

async function updateCustomer(executor, id, u) {
  await executor.query(
    `UPDATE customers SET rut=$1, first_name=$2, last_name=$3, birth_date=$4, email=$5, whatsapp_number=$6
     WHERE id=$7`,
    [u.rut, u.first_name, u.last_name, u.birth_date, u.email, u.whatsapp_number, id]
  );
}

// Borrado en cascada (dentro de una transacción provista por el servicio).
async function deleteCascade(executor, id) {
  const cards = await queryAll(executor, 'SELECT id FROM loyalty_cards WHERE customer_id = $1', [id]);
  for (const card of cards) {
    await executor.query('DELETE FROM reward_redemptions WHERE loyalty_card_id = $1', [card.id]);
    await executor.query('DELETE FROM stamp_events WHERE loyalty_card_id = $1', [card.id]);
  }
  await executor.query('DELETE FROM loyalty_cards WHERE customer_id = $1', [id]);
  await executor.query('DELETE FROM purchases WHERE customer_id = $1', [id]);
  await executor.query('DELETE FROM notifications_log WHERE customer_id = $1', [id]);
  await executor.query('DELETE FROM customers WHERE id = $1', [id]);
}

// Listado para el panel admin (con marcas, boletas y premios por cliente).
async function listWithCardInfo(executor) {
  return queryAll(
    executor,
    `SELECT c.id, c.rut, c.first_name, c.last_name, c.birth_date, c.email,
            lc.current_stamps, lp.required_stamps, lc.status, lc.unique_token, lc.short_code,
            (SELECT COUNT(*) FROM purchases p WHERE p.customer_id = c.id) AS total_boletas,
            (SELECT COUNT(*) FROM reward_redemptions rr
               JOIN loyalty_cards lc2 ON lc2.id = rr.loyalty_card_id
             WHERE lc2.customer_id = c.id) AS premios
     FROM customers c
     LEFT JOIN loyalty_cards lc ON lc.customer_id = c.id
     LEFT JOIN loyalty_programs lp ON lp.id = lc.program_id
     ORDER BY c.id DESC`
  );
}

async function detailPurchases(executor, id) {
  return queryAll(
    executor,
    `SELECT p.id, p.receipt_number AS documento, p.purchase_date,
            COALESCE(SUM(sd.total_bruto), 0) AS monto,
            MIN(sd.fecha) AS fecha, MIN(sd.hora) AS hora
     FROM purchases p
     LEFT JOIN sales_detail sd ON sd.documento = p.receipt_number
     WHERE p.customer_id = $1
     GROUP BY p.id
     ORDER BY p.id DESC`,
    [id]
  );
}

async function topProducts(executor, id) {
  return queryAll(
    executor,
    `SELECT sd.producto, SUM(sd.cantidad) AS cantidad, SUM(sd.total_bruto) AS monto
     FROM sales_detail sd
     WHERE sd.documento IN (SELECT receipt_number FROM purchases WHERE customer_id = $1)
       AND sd.producto IS NOT NULL
     GROUP BY sd.producto ORDER BY cantidad DESC LIMIT 10`,
    [id]
  );
}

async function hourPattern(executor, id) {
  return queryAll(
    executor,
    `SELECT CAST(SUBSTR(sd.hora,1,2) AS INTEGER) AS hora_del_dia, COUNT(*) AS veces
     FROM sales_detail sd
     WHERE sd.documento IN (SELECT receipt_number FROM purchases WHERE customer_id = $1)
       AND sd.hora IS NOT NULL
     GROUP BY hora_del_dia ORDER BY veces DESC`,
    [id]
  );
}

// strftime('%w') -> EXTRACT(DOW ...). Ambos: domingo=0 .. sábado=6.
async function dayPattern(executor, id) {
  return queryAll(
    executor,
    `SELECT CAST(EXTRACT(DOW FROM sd.fecha::date) AS INTEGER) AS dow, COUNT(*) AS veces
     FROM sales_detail sd
     WHERE sd.documento IN (SELECT receipt_number FROM purchases WHERE customer_id = $1)
       AND sd.fecha IS NOT NULL
     GROUP BY dow ORDER BY veces DESC`,
    [id]
  );
}

module.exports = {
  getById,
  getByRut,
  insertCustomer,
  updateCustomer,
  deleteCascade,
  listWithCardInfo,
  detailPurchases,
  topProducts,
  hourPattern,
  dayPattern,
};
