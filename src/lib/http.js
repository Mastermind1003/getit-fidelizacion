'use strict';

// Escape HTML para render seguro del lado servidor (SSR de las vistas).
// Reemplaza las 2 definiciones duplicadas del monolito (server + cliente admin).
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
