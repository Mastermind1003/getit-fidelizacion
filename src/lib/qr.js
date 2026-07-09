'use strict';

// QRCode es opcional (igual que en el monolito): si el módulo no está instalado
// las vistas caen a un respaldo de texto.
let QRCode = null;
try {
  QRCode = require('qrcode');
} catch (e) {
  /* no disponible */
}

async function qrDataUrl(text, opts) {
  if (!QRCode) return null;
  try {
    return await QRCode.toDataURL(text, opts || {});
  } catch (e) {
    return null;
  }
}

function isAvailable() {
  return !!QRCode;
}

module.exports = { qrDataUrl, isAvailable };
