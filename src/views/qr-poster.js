'use strict';

// Cartel QR para el mesón (SSR del QR de /registro).
function render(qrDataUrl, registroUrl) {
  const qrHtml = qrDataUrl
    ? `<img src="${qrDataUrl}" alt="QR registro">`
    : `<div style="font-family:monospace;word-break:break-all;padding:20px;">${registroUrl}</div>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Escanea para unirte</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#16321f;color:#fff;margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;}
  h1{font-size:32px;margin-bottom:10px;}
  p{font-size:18px;opacity:0.85;margin-bottom:30px;}
  .qrbox{background:#fff;padding:24px;border-radius:20px;}
  .qrbox img{width:320px;height:320px;display:block;}
  .hint{margin-top:24px;font-size:14px;opacity:0.6;}
  @media print { body{background:#fff;color:#000;} }
</style></head>
<body>
  <h1>¡Únete a nuestro Club de Fidelidad!</h1>
  <p>Escanea este código con la cámara de tu celular para crear tu tarjeta</p>
  <div class="qrbox">${qrHtml}</div>
  <div class="hint">Imprime esta página (Ctrl+P) para tenerla en el mesón</div>
</body></html>`;
}

module.exports = { render };
