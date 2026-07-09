'use strict';

const crypto = require('crypto');

// Token de sesión (32 bytes hex) y token público de tarjeta (UUID), igual que el monolito.
function sessionToken() {
  return crypto.randomBytes(32).toString('hex');
}
function cardToken() {
  return crypto.randomUUID();
}

// Short-code numérico "NNNN-NN". Unifica genShortCode + generateUniqueShortCode.
function genShortCode() {
  const digits = '0123456789';
  const part = (len) =>
    Array.from({ length: len }, () => digits[Math.floor(Math.random() * digits.length)]).join('');
  return `${part(4)}-${part(2)}`;
}

// Genera un short-code único. `executor` = pool o client de transacción.
async function generateUniqueShortCode(executor) {
  let code;
  let exists;
  do {
    code = genShortCode();
    const r = await executor.query('SELECT 1 FROM loyalty_cards WHERE short_code = $1', [code]);
    exists = r.rows[0];
  } while (exists);
  return code;
}

module.exports = { sessionToken, cardToken, genShortCode, generateUniqueShortCode };
