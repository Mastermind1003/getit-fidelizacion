'use strict';

// Página pública de registro (SSR de registro_config).
// formatRut/onRutInput vienen de /js/rut.js (dedup).
function render(cfg = {}) {
  const logoUrl = cfg.logo_url || 'https://i.imgur.com/nJrUCee.png';
  const logoWidth = cfg.logo_width || 140;
  const titulo = cfg.titulo || 'Club de Fidelización';
  const subtitulo = cfg.subtitulo || 'Regístrate y acumula marcas con tus compras';
  const btnColor = cfg.btn_color || '#16321f';
  const btnTexto = cfg.btn_texto || 'Crear mi tarjeta';
  const showRut = cfg.campo_rut !== 0;
  const showNombre = cfg.campo_nombre !== 0;
  const showApell = cfg.campo_apellido !== 0;
  const showEmail = cfg.campo_correo !== 0;
  const showTel = cfg.campo_telefono !== 0;
  const showNac = cfg.campo_nacimiento !== 0;
  const chk2 = cfg.chk2_texto || 'Autorizo a Get it a usar mis datos personales para gestionar mi membresía y enviarme comunicaciones sobre ofertas, promociones y beneficios del club.';
  const bgColor = cfg.bg_color || '#f4f4f5';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Registro Club GETit</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,system-ui,sans-serif;background:${bgColor};margin:0;padding:20px;}
  .panel{max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:24px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.1);}
  .logo{text-align:center;margin-bottom:16px;}
  .logo img{max-width:${logoWidth}px;max-height:150px;object-fit:contain;}
  h2{margin-top:0;font-size:20px;text-align:center;color:#16321f;}
  p.sub{text-align:center;font-size:13px;color:#666;margin-bottom:20px;}
  label{display:block;font-size:13px;font-weight:600;margin-top:14px;margin-bottom:4px;color:#333;}
  input[type=text],input[type=email],input[type=date],input[type=tel]{width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;}
  input:focus{outline:none;border-color:#16321f;}
  .hint{font-size:11px;color:#aaa;margin-top:3px;}
  .phone-row{display:flex;gap:8px;align-items:center;}
  .phone-prefix{padding:10px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;background:#f9f9f9;color:#333;white-space:nowrap;}
  .phone-row input{flex:1;}
  .check-group{margin-top:18px;display:flex;flex-direction:column;gap:14px;}
  .check-item{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:#444;line-height:1.5;cursor:pointer;}
  .check-item input[type=checkbox]{width:18px;height:18px;min-width:18px;margin-top:2px;accent-color:#16321f;cursor:pointer;}
  button{margin-top:22px;width:100%;padding:13px;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-weight:600;background:${btnColor};}
  button:disabled{background:#aaa;cursor:not-allowed;}
  .result{margin-top:16px;padding:14px;border-radius:8px;font-size:14px;}
</style></head>
<body>
<div class="panel">
  <div class="logo"><img src="${logoUrl}" alt="GETit"></div>
  <h2>${titulo}</h2>
  <p class="sub">${subtitulo}</p>
  <form id="form" autocomplete="off">
    ${showRut ? `<label>RUT</label>
    <input type="text" name="rut" placeholder="12345678-5" oninput="onRutInput(event)">
    <div class="hint">Sin puntos, con guión. Ej: 12345678-5</div>` : ''}

    ${showNombre ? `<label>Nombre</label>
    <input type="text" name="first_name" placeholder="Juan" style="text-transform:uppercase;">` : ''}

    ${showApell ? `<label>Apellido</label>
    <input type="text" name="last_name" placeholder="Pérez" style="text-transform:uppercase;">` : ''}

    ${showEmail ? `<label>Correo electrónico</label>
    <input type="email" name="email" placeholder="juan@correo.com">` : ''}

    ${showTel ? `<label>Teléfono</label>
    <div class="phone-row">
      <span class="phone-prefix">+569</span>
      <input type="tel" name="phone" placeholder="12345678" maxlength="8" inputmode="numeric" pattern="[0-9]{8}">
    </div>
    <div class="hint">8 dígitos. Ej: 12345678</div>` : ''}

    ${showNac ? `<label>Fecha de nacimiento</label>
    <input type="date" name="birth_date" min="1900-01-01" max="2100-12-31">` : ''}

    <div class="check-group">
      <label class="check-item">
        <input type="checkbox" id="chk1" required>
        <span>He leído y acepto los <a href="/terminos" target="_blank" style="color:#16321f;font-weight:700;">Términos y Condiciones</a> del Club de Fidelización Get it.</span>
      </label>
      <label class="check-item">
        <input type="checkbox" id="chk2" required>
        <span>${chk2}</span>
      </label>
    </div>

    <button type="submit" id="submitBtn">${btnTexto}</button>
  </form>
  <div id="result"></div>
</div>
<script src="/js/rut.js"></script>
<script>
document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const div = document.getElementById('result');

  if (!document.getElementById('chk1').checked || !document.getElementById('chk2').checked) {
    showError('Debes aceptar ambas condiciones para continuar.');
    return;
  }

  let rut;
  if (f.rut) {
    const rutRaw = f.rut.value.trim();
    const rutDigits = rutRaw.replace(/[^0-9kK]/gi, '');
    rut = rutDigits.length >= 2 ? rutDigits.slice(0,-1) + '-' + rutDigits.slice(-1).toUpperCase() : rutRaw;
  } else {
    rut = 'TEMP-' + Date.now();
  }

  if (f.phone) {
    const phone = f.phone.value.trim();
    if (phone && (phone.length !== 8 || !/^[0-9]{8}$/.test(phone))) {
      showError('El teléfono debe tener exactamente 8 dígitos.');
      return;
    }
  }

  div.style.cssText = 'margin-top:16px;padding:14px;border-radius:8px;font-size:14px;background:#e6f4ea;color:#16321f;';
  div.textContent = 'Registrando...';
  document.getElementById('submitBtn').disabled = true;

  const ts = Date.now();
  const body = {
    rut,
    first_name: f.first_name ? f.first_name.value.trim() || 'Cliente' : 'Cliente',
    last_name:  f.last_name  ? f.last_name.value.trim()  || '-'      : '-',
    birth_date: f.birth_date ? f.birth_date.value : '2000-01-01',
    email:      f.email      ? f.email.value.trim()       : (ts + '@getit.cl'),
    marcas: 0
  };
  if (f.phone && f.phone.value.trim()) body.whatsapp_number = '+569' + f.phone.value.trim();

  const r = await fetch('/api/customers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await r.json();

  if (r.ok) {
    div.style.cssText = 'margin-top:16px;padding:14px;border-radius:8px;font-size:14px;background:#e6f4ea;color:#16321f;';
    div.textContent = '✓ Registro exitoso. Abriendo tu tarjeta...';
    setTimeout(() => { window.location.href = window.location.origin + data.wallet_link; }, 1200);
  } else {
    showError(data.error || 'Error al registrar.');
    document.getElementById('submitBtn').disabled = false;
  }
});

function showError(msg) {
  const div = document.getElementById('result');
  div.style.cssText = 'margin-top:16px;padding:14px;border-radius:8px;font-size:14px;background:#fdeaea;color:#a01818;';
  div.textContent = msg;
}
</script>
</body></html>`;
}

module.exports = { render };
