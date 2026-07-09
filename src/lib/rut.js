'use strict';

// Valida RUT chileno en formato "12345678-9" (sin puntos, con guión).
function isValidRut(rut) {
  if (typeof rut !== 'string') return false;
  const clean = rut.trim().toUpperCase();
  const match = clean.match(/^(\d{7,8})-([0-9K])$/);
  if (!match) return false;

  const number = match[1];
  const dv = match[2];

  let sum = 0;
  let multiplier = 2;
  for (let i = number.length - 1; i >= 0; i--) {
    sum += parseInt(number[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  let expectedDv;
  if (remainder === 11) expectedDv = '0';
  else if (remainder === 10) expectedDv = 'K';
  else expectedDv = String(remainder);

  return expectedDv === dv;
}

// Normaliza un RUT para importación: quita puntos, mayúsculas, y agrega el guión
// antes del dígito verificador si falta. Idéntico al normalizeRut del monolito.
function normalizeRut(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toUpperCase().replace(/\./g, '');
  if (!s.includes('-') && s.length > 1) s = s.slice(0, -1) + '-' + s.slice(-1);
  return s;
}

module.exports = { isValidRut, normalizeRut };
