'use strict';

// Login unificado (SSR de login_config). togglePwd viene de /js/auth.js (dedup).
function render(cfg = {}) {
  const logoUrl = cfg.logo_url || 'https://i.imgur.com/nJrUCee.png';
  const logoWidth = cfg.logo_width || 120;
  const bgColor = cfg.bg_color || '#f4f4f5';
  const btnColor = cfg.btn_color || '#16321f';
  const btnTexto = cfg.btn_texto || 'Ingresar';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Acceso — GETit</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,system-ui,sans-serif;background:${bgColor};margin:0;padding:20px;display:flex;min-height:100vh;align-items:center;justify-content:center;}
  .panel{max-width:380px;width:100%;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.1);}
  .logo{text-align:center;margin-bottom:20px;}
  .logo .logo-badge{}
  .logo img{max-width:${logoWidth}px;max-height:140px;object-fit:contain;display:block;}
  h2{margin-top:0;text-align:center;color:#333;}
  label{display:block;font-size:13px;font-weight:600;margin-top:14px;margin-bottom:4px;color:#333;}
  input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:15px;}
  input:focus{outline:none;border-color:${btnColor};}
  .pwdwrap{position:relative;}
  .pwdwrap input{padding-right:40px;}
  .eyebtn{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;padding:4px;margin:0;width:auto;color:#666;}
  button[type=submit]{margin-top:20px;width:100%;padding:12px;background:${btnColor};color:#fff;border:none;border-radius:6px;font-size:16px;cursor:pointer;font-weight:600;}
  .err{margin-top:14px;padding:12px;border-radius:8px;font-size:14px;background:#fdeaea;color:#a01818;display:none;}
</style></head>
<body>
<div class="panel">
  <div class="logo"><span class="logo-badge"><img src="${logoUrl}" alt="GETit" onerror="this.style.display='none'"></span></div>
  <h2>Acceso al sistema</h2>
  <form id="loginForm">
    <label>Usuario</label>
    <input name="username" type="text" required autofocus>
    <label>Contraseña</label>
    <div class="pwdwrap">
      <input name="password" type="password" id="pwdInput" required>
      <button type="button" class="eyebtn" onclick="togglePwd('pwdInput')">👁</button>
    </div>
    <button type="submit">${btnTexto}</button>
  </form>
  <div class="err" id="loginErr"></div>
</div>
<script src="/js/auth.js"></script>
<script>
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const r = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: f.username.value, password: f.password.value })
  });
  const data = await r.json();
  const err = document.getElementById('loginErr');
  if (r.ok) {
    window.location.href = (data.staff.role === 'admin' || data.staff.role === 'superadmin') ? '/admin' : '/caja';
  } else {
    err.style.display = 'block';
    err.textContent = data.error || 'Usuario o contraseña incorrectos.';
  }
});
</script>
</body></html>`;
}

module.exports = { render };
