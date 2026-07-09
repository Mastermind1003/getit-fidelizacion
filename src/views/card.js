'use strict';

const { escapeHtml } = require('../lib/http');

// Tarjeta pública de solo lectura (SSR completo). `qrDataUrl` = data-URL o null.
function render(card, qrDataUrl) {
  const qrHtml = qrDataUrl
    ? `<img src="${qrDataUrl}" alt="QR">`
    : `<div style="padding:24px 16px;text-align:center;color:#888;font-size:13px;line-height:1.6;">QR no disponible en este entorno.<br>Usa el código de abajo para identificarte en caja.</div>`;

  let grid = '';
  for (let i = 0; i < card.required_stamps; i++) {
    const filled = i < card.current_stamps;
    grid += `<div class="stamp ${filled ? 'filled' : ''}">${filled ? card.stamp_icon : ''}</div>`;
  }

  const statusMsg = card.status === 'completed'
    ? '¡Premio disponible! Muéstrale esta pantalla al cajero.'
    : '';

  const logoHtml = card.logo_url
    ? `<img src="${card.logo_url}" alt="logo" style="width:min(${card.logo_width || 200}px, 80%);max-height:110px;height:auto;object-fit:contain;display:block;margin:0 auto;">`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(card.program_name)} - ${escapeHtml(card.first_name)}</title>
<link rel="manifest" href="/manifest.json">
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background:${card.secondary_color}; color:#fff; margin:0; padding:0; display:flex; justify-content:center; }
  .card { width:100%; max-width:380px; background:${card.primary_color}; min-height:100vh; padding:16px 20px; box-sizing:border-box; text-align:center; }
  .logo-row { display:flex; justify-content:center; align-items:center; min-height:0; margin-bottom:6px; }
  .brand { font-size:22px; font-weight:700; margin-bottom:4px; }
  .name { font-size:18px; opacity:0.9; margin-bottom:20px; }
  .qr { background:#fff; padding:16px; border-radius:14px; display:inline-block; margin-bottom:24px; }
  .qr img { width:220px; height:220px; display:block; }
  .grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:20px; }
  .stamp { aspect-ratio:1; border-radius:50%; background:rgba(255,255,255,0.18); border:2px dashed rgba(255,255,255,0.4); display:flex; align-items:center; justify-content:center; font-size:${card.stamp_size || 22}px; color:#fff; }
  .stamp.filled { background:${card.stamp_color || '#d62828'}; border:2px solid ${card.stamp_color || '#d62828'}; }
  .progress { font-size:14px; opacity:0.8; margin-bottom:8px; }
  .status { background:rgba(255,255,255,0.08); padding:12px; border-radius:10px; font-size:14px; margin-bottom:18px; text-align:left; }
  .powered { text-align:center; font-size:11px; opacity:0.5; margin-top:10px; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo-row">${logoHtml}</div>
    <div class="brand">${card.program_name}</div>
    <div class="name">${escapeHtml(card.first_name)} ${escapeHtml(card.last_name)}</div>
    <div class="qr">${qrHtml}</div>
    <div style="font-size:13px;letter-spacing:1px;opacity:0.85;margin-bottom:18px;">Código: <strong>${card.short_code || '—'}</strong></div>
    <div class="grid">${grid}</div>
    <div class="progress">VISITAS: ${card.current_stamps} / ${card.required_stamps}</div>
    ${statusMsg ? `<div class="status">${statusMsg}</div>` : ''}
    <div class="powered">Tarjeta de solo lectura · actualizada por el sistema</div>
  </div>
</body>
</html>`;
}

module.exports = { render };
