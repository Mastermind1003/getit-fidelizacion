'use strict';

// Página pública para que el cliente busque su tarjeta por RUT.
// formatRut/onRutInput vienen de /js/rut.js (dedup).
function render() {
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ver mi tarjeta</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,system-ui,sans-serif;background:#f4f4f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}
  .panel{background:#fff;border-radius:16px;padding:32px 28px;max-width:380px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,0.1);}
  h1{font-size:22px;margin-bottom:6px;color:#16321f;}
  p{font-size:14px;color:#666;margin-bottom:24px;line-height:1.5;}
  label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#333;}
  input{width:100%;padding:12px;border:1.5px solid #ddd;border-radius:8px;font-size:16px;transition:border-color .2s;}
  input:focus{outline:none;border-color:#16321f;}
  button{width:100%;margin-top:14px;padding:13px;background:#16321f;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-weight:600;}
  button:active{opacity:0.9;}
  .err{margin-top:14px;padding:12px;border-radius:8px;background:#fdeaea;color:#a01818;font-size:14px;display:none;}
  .hint{margin-top:12px;font-size:12px;color:#999;text-align:center;}
  .logo{text-align:center;margin-bottom:20px;font-size:28px;font-weight:800;color:#16321f;letter-spacing:-1px;}
</style>
</head>
<body>
<div class="panel">
  <div class="logo">GETit</div>
  <h1>Ver mi tarjeta</h1>
  <p>Ingresa tu RUT para acceder a tu tarjeta de fidelización y ver tus marcas acumuladas.</p>
  <label>RUT (sin puntos, con guión)</label>
  <input type="text" id="rutInput" placeholder="12345678-5" oninput="onRutInput(event)" autofocus>
  <button onclick="buscar()">Ver mi tarjeta</button>
  <div class="err" id="errMsg"></div>
  <p class="hint">¿Aún no estás registrado? <a href="/registro" style="color:#16321f;">Regístrate aquí</a></p>
</div>
<script src="/js/rut.js"></script>
<script>
document.getElementById('rutInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') buscar();
});

async function buscar() {
  const raw = document.getElementById('rutInput').value.trim();
  const rutDigitsM = raw.replace(/[^0-9kK]/gi, '');
  const rut = rutDigitsM.length >= 2 ? rutDigitsM.slice(0,-1) + '-' + rutDigitsM.slice(-1).toUpperCase() : raw.trim();
  const err = document.getElementById('errMsg');
  err.style.display = 'none';
  if (!rut) { err.textContent = 'Por favor ingresa tu RUT.'; err.style.display = 'block'; return; }

  const btn = document.querySelector('button');
  btn.textContent = 'Buscando...';
  btn.disabled = true;

  const r = await fetch('/api/buscar-tarjeta/' + encodeURIComponent(rut));
  const data = await r.json();
  btn.textContent = 'Ver mi tarjeta';
  btn.disabled = false;

  if (r.ok) {
    window.location.href = '/tarjeta/' + data.token;
  } else {
    err.textContent = data.error || 'Error al buscar.';
    err.style.display = 'block';
  }
}
</script>
</body></html>`;
}

module.exports = { render };
