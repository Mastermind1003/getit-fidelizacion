'use strict';

// Pantalla de caja (auth-gated en la ruta). formatRut viene de /js/rut.js y
// logout de /js/auth.js (dedup). El resto del script es específico de la caja.
function render(staff) {
  const roleLabel = staff.role === 'superadmin' ? 'super administrador'
    : staff.role === 'admin' ? 'administrador' : 'cajero';
  const adminBtn = ['admin', 'superadmin'].includes(staff.role)
    ? '<button onclick="window.location.href=\'/admin\'">← Admin</button>' : '';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Caja - Asignar marca</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#f4f4f5;margin:0;padding:20px;}
  .topbar{max-width:480px;margin:0 auto 10px;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#555;}
  .topbar button{width:auto;margin:0;padding:6px 12px;background:#888;font-size:12px;}
  .panel{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.1);}
  label{display:block;font-size:13px;font-weight:600;margin-top:14px;margin-bottom:4px;color:#333;}
  input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:15px;}
  button{margin-top:16px;width:100%;padding:12px;background:#16321f;color:#fff;border:none;border-radius:6px;font-size:16px;cursor:pointer;}
  .secondary{background:#444;}
  h2{margin-top:0;}
  .result{margin-top:18px;padding:14px;border-radius:8px;font-size:14px;}
  .ok{background:#e6f4ea;color:#16321f;}
  .err{background:#fdeaea;color:#a01818;}
  .customer-card{display:none;margin-top:20px;border-top:1px solid #eee;padding-top:16px;}
  .stamps{font-size:28px;font-weight:700;margin:8px 0;}
  .tabs{display:flex;gap:8px;margin-bottom:6px;}
  .tabbtn{width:auto;flex:1;margin-top:0;padding:8px;background:#eee;color:#333;font-size:13px;}
  .tabbtn.active{background:#16321f;color:#fff;}
</style></head>
<body>
<div class="topbar">
  <span>Sesión: ${staff.name} (${roleLabel})</span>
  <div style="display:flex;gap:8px;">
    ${adminBtn}
    <button onclick="logout()">Cerrar sesión</button>
  </div>
</div>
<div class="panel">
  <h2>Caja: buscar cliente</h2>
  <div class="tabs">
    <button type="button" class="tabbtn active" id="tabRut" onclick="switchTab('rut')">Por RUT</button>
    <button type="button" class="tabbtn" id="tabCode" onclick="switchTab('code')">Por código</button>
  </div>
  <form id="searchFormRut">
    <label>RUT del cliente (sin puntos, con guión)</label>
    <input name="rut" placeholder="12345678-5" oninput="onRutInput(event)" required>
    <button type="submit">Buscar</button>
  </form>
  <form id="searchFormCode" style="display:none;">
    <label>Código de la tarjeta (debajo del QR)</label>
    <input name="code" placeholder="XXXX-XX" oninput="onCodeInput(event)" required>
    <button type="submit">Buscar</button>
  </form>
  <div id="searchResult"></div>

  <div id="customerCard" class="customer-card">
    <h3 id="custName"></h3>
    <div class="stamps" id="custStamps"></div>
    <form id="purchaseForm">
      <input type="hidden" name="card_token" id="cardToken">
      <label>N° de boleta</label>
      <input name="receipt_number" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="9642630" required style="appearance:textfield;-moz-appearance:textfield;">
      <button type="submit">Registrar compra y asignar marca</button>
    </form>
    <div id="purchaseResult"></div>
    <button class="secondary" onclick="redeem()" id="redeemBtn" style="display:none;">Canjear premio</button>
  </div>
</div>
<script src="/js/rut.js"></script>
<script src="/js/auth.js"></script>
<script>
let currentToken = null;

function formatCode(val) {
  const v = val.replace(/[^0-9]/g, '');
  if (v.length <= 4) return v;
  return v.slice(0,4) + '-' + v.slice(4,6);
}
function onCodeInput(e) {
  e.target.value = formatCode(e.target.value);
}

function switchTab(tab) {
  document.getElementById('tabRut').classList.toggle('active', tab === 'rut');
  document.getElementById('tabCode').classList.toggle('active', tab === 'code');
  document.getElementById('searchFormRut').style.display = tab === 'rut' ? 'block' : 'none';
  document.getElementById('searchFormCode').style.display = tab === 'code' ? 'block' : 'none';
  document.getElementById('searchResult').innerHTML = '';
  document.getElementById('customerCard').style.display = 'none';
  document.getElementById('purchaseResult').innerHTML = '';
  document.getElementById('searchFormRut').reset();
  document.getElementById('searchFormCode').reset();
  currentToken = null;
}

function showCustomer(data) {
  document.getElementById('searchResult').innerHTML = '';
  document.getElementById('customerCard').style.display = 'block';
  document.getElementById('custName').textContent = data.customer.first_name + ' ' + data.customer.last_name + ' (' + data.customer.rut + ')';
  document.getElementById('custStamps').textContent = data.card.current_stamps + ' / ' + data.card.required_stamps + ' marcas';
  document.getElementById('cardToken').value = data.card.unique_token;
  currentToken = data.card.unique_token;
  document.getElementById('redeemBtn').style.display = data.card.status === 'completed' ? 'block' : 'none';
}

function showSearchError(data) {
  document.getElementById('customerCard').style.display = 'none';
  const resDiv = document.getElementById('searchResult');
  resDiv.className = 'result err';
  resDiv.textContent = data.error;
}

document.getElementById('searchFormRut').addEventListener('submit', async (e) => {
  e.preventDefault();
  const rutRawC = e.target.rut.value.trim();
  const rutDigitsC = rutRawC.replace(/[^0-9kK]/gi, '');
  const rut = rutDigitsC.length >= 2 ? rutDigitsC.slice(0,-1) + '-' + rutDigitsC.slice(-1).toUpperCase() : rutRawC;
  const r = await fetch('/api/customers/by-rut/' + encodeURIComponent(rut));
  const data = await r.json();
  if (r.status === 401) { window.location.href = '/login'; return; }
  r.ok ? showCustomer(data) : showSearchError(data);
});

document.getElementById('searchFormCode').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = e.target.code.value.trim();
  const r = await fetch('/api/customers/by-code/' + encodeURIComponent(code));
  const data = await r.json();
  if (r.status === 401) { window.location.href = '/login'; return; }
  r.ok ? showCustomer(data) : showSearchError(data);
});

document.getElementById('purchaseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    card_token: f.card_token.value,
    branch_id: 1,
    receipt_number: f.receipt_number.value
  };
  const r = await fetch('/api/purchases', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await r.json();
  const div = document.getElementById('purchaseResult');
  if (r.status === 401) { window.location.href = '/login'; return; }
  if (r.ok) {
    if (data.card_status === 'completed') {
      div.className = 'result ok';
      div.textContent = '¡Marca asignada! ' + data.current_stamps + '/' + (data.current_stamps >= 10 ? data.current_stamps : 10) + ' marcas. ¡Premio disponible!';
      document.getElementById('custStamps').textContent = data.current_stamps + ' marcas';
      document.getElementById('redeemBtn').style.display = 'block';
      f.reset();
    } else {
      div.className = 'result ok';
      div.textContent = '✓ Marca registrada (' + data.current_stamps + '/10). Listo para el siguiente cliente.';
      f.reset();
      setTimeout(() => {
        document.getElementById('customerCard').style.display = 'none';
        document.getElementById('purchaseResult').innerHTML = '';
        document.getElementById('searchFormRut').reset();
        document.getElementById('searchFormCode').reset();
        currentToken = null;
        const activeTab = document.getElementById('tabRut').classList.contains('active') ? 'rut' : 'code';
        document.getElementById(activeTab === 'rut' ? 'searchFormRut' : 'searchFormCode').querySelector('input').focus();
      }, 1500);
    }
  } else {
    div.className = 'result err';
    div.textContent = data.error;
  }
});

async function redeem() {
  var ov = document.createElement('div');
  ov.id = 'redeemOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;box-sizing:border-box;';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:380px;width:100%;box-sizing:border-box;';
  var title = document.createElement('h3');
  title.style.marginTop = '0';
  title.textContent = 'Confirmar canje de premio';
  var desc = document.createElement('p');
  desc.style.cssText = 'font-size:13px;color:#555;margin-bottom:12px;';
  desc.textContent = 'Ingresa el RUT del cliente para validar el canje.';
  var inp = document.createElement('input');
  inp.id = 'redeemRutInput';
  inp.type = 'text';
  inp.placeholder = '12345678-5';
  inp.oninput = function(e) { onRutInput(e); };
  inp.style.cssText = 'width:100%;padding:10px;border:1.5px solid #ccc;border-radius:6px;font-size:15px;box-sizing:border-box;';
  var err = document.createElement('div');
  err.id = 'redeemErr';
  err.style.cssText = 'color:#a01818;font-size:13px;margin-top:8px;display:none;';
  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';
  var btnOk = document.createElement('button');
  btnOk.type = 'button';
  btnOk.textContent = 'Confirmar canje';
  btnOk.style.cssText = 'flex:1;padding:10px;background:#16321f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;';
  btnOk.onclick = confirmRedeem;
  var btnCan = document.createElement('button');
  btnCan.type = 'button';
  btnCan.textContent = 'Cancelar';
  btnCan.style.cssText = 'flex:1;padding:10px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;';
  btnCan.onclick = closeRedeemModal;
  btnRow.appendChild(btnOk);
  btnRow.appendChild(btnCan);
  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(inp);
  box.appendChild(err);
  box.appendChild(btnRow);
  ov.appendChild(box);
  document.body.appendChild(ov);
  inp.focus();
}

function closeRedeemModal() {
  const el = document.getElementById('redeemOverlay');
  if (el) el.remove();
}

async function confirmRedeem() {
  const rutRawR = document.getElementById('redeemRutInput').value.trim();
  const rutDigitsR = rutRawR.replace(/[^0-9kK]/gi, '');
  const rut = rutDigitsR.length >= 2 ? rutDigitsR.slice(0,-1) + '-' + rutDigitsR.slice(-1).toUpperCase() : rutRawR;
  const errDiv = document.getElementById('redeemErr');
  if (!rut) { errDiv.textContent = 'Ingresa el RUT.'; errDiv.style.display = 'block'; return; }
  const r = await fetch('/api/cards/' + currentToken + '/redeem', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rut }) });
  const data = await r.json();
  const div = document.getElementById('purchaseResult');
  if (r.status === 401) { window.location.href = '/login'; return; }
  if (r.ok) {
    document.getElementById('redeemOverlay').remove();
    div.className = 'result ok';
    div.textContent = '¡Premio canjeado: ' + data.reward + '! La tarjeta volvió a 0.';
    document.getElementById('custStamps').textContent = '0 marcas';
    document.getElementById('redeemBtn').style.display = 'none';
  } else {
    errDiv.textContent = data.error;
    errDiv.style.display = 'block';
  }
}
</script>
</body></html>`;
}

module.exports = { render };
