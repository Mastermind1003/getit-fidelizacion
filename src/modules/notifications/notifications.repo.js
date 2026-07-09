'use strict';

// Registro de notificaciones (solo escritura; nunca se lee en la app).
async function log(executor, customerId, channel, messageType, content) {
  await executor.query(
    `INSERT INTO notifications_log (customer_id, channel, message_type, content)
     VALUES ($1,$2,$3,$4)`,
    [customerId, channel, messageType, content]
  );
}

module.exports = { log };
