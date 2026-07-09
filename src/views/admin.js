'use strict';

// Panel de administración (SSR de `programs` para el editor de diseño).
// escapeHtml -> /js/util.js, logout -> /js/auth.js (dedup). Resto idéntico al monolito.
function render(staff, programs) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin GETit</title>
<script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"></script>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,system-ui,sans-serif;background:#f4f4f5;margin:0;padding:20px;}
  .wrap{max-width:900px;margin:0 auto;}
  .topbar{max-width:900px;margin:0 auto 14px;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#555;}
  .topbar .actions{display:flex;gap:8px;}
  .topbar button{width:auto;margin:0;padding:7px 14px;background:#888;font-size:12px;color:#fff;border:none;border-radius:6px;cursor:pointer;}
  .panel{background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.1);margin-bottom:20px;}
  .tabs{display:flex;gap:8px;margin-bottom:18px;}
  .tabbtn{padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;}
  .tabbtn.active{background:#16321f;color:#fff;}
  .tabbtn:not(.active){background:#ddd;color:#333;}
  h2{margin-top:0;}
  label{display:block;font-size:13px;font-weight:600;margin-top:14px;margin-bottom:4px;color:#333;}
  input[type=text],input[type=number],input[type=url]{width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px;}
  button{margin-top:18px;width:100%;padding:10px;background:#16321f;color:#fff;border:none;border-radius:6px;font-size:15px;cursor:pointer;}
  .btnrow{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
  .btnrow button{width:auto;margin-top:0;padding:10px 16px;font-size:14px;}
  .btn-excel{background:#0D8063;}
  .btn-danger{background:#a01818;}
  .msg{font-size:13px;margin-top:10px;}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;}
  th{text-align:left;padding:10px 8px;border-bottom:2px solid #eee;white-space:nowrap;}
  td{padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle;white-space:nowrap;}
  .actbtn{width:auto;margin:0 4px 0 0;padding:5px 10px;font-size:12px;background:#888;}
  .delbtn{background:#a01818;}
  .colorrow{display:flex;gap:8px;align-items:center;margin-top:4px;}
  .colorrow input[type=color]{width:42px;height:36px;padding:2px;border:1px solid #ccc;border-radius:6px;cursor:pointer;}
  .colorrow input[type=text]{flex:1;}
  .rangerow{display:flex;align-items:center;gap:10px;margin-top:4px;}
  .rangerow input[type=range]{flex:1;}
  .rangeval{font-size:13px;color:#666;width:50px;text-align:right;}
  .iconbtn{width:36px;height:36px;min-width:36px;margin-top:0;font-size:18px;border:1px solid #ccc;border-radius:6px;background:#fafafa;cursor:pointer;padding:0;color:#333;}
  .iconbtn.active{border-color:#16321f;border-width:2px;background:#eef4ef;}
  .iconrow{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
  .design-wrap{display:flex;gap:24px;flex-wrap:wrap;}
  .formcol{flex:1;min-width:280px;}
  .previewcol{width:220px;display:flex;flex-direction:column;align-items:center;}
  .preview-card{width:200px;border-radius:14px;padding:14px;text-align:center;color:#fff;}
  .preview-card img{display:block;margin:0 auto 8px;object-fit:contain;}
  .preview-brand{font-size:13px;font-weight:700;margin-bottom:2px;}
  .preview-qr{background:#fff;border-radius:8px;width:80px;height:80px;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:10px;}
  .preview-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:8px 0;}
  .preview-stamp{aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,0.15);border:1px dashed rgba(255,255,255,0.4);display:flex;align-items:center;justify-content:center;}
  .preview-stamp.filled{border:none;}
  .preview-progress{font-size:11px;opacity:0.8;}
  .overflow-x{overflow-x:auto;}
</style></head>
<body data-role="${staff.role}">
<div class="topbar">
  <span>Sesión: ${staff.name} (${staff.role === 'superadmin' ? 'super administrador' : 'administrador'})</span>
  <div class="actions">
    <button onclick="window.location.href='/registro'">Registro</button>
    <button onclick="window.location.href='/caja'">Ir a caja</button>
    <button onclick="logout()">Cerrar sesión</button>
  </div>
</div>
<div class="wrap">
  <div class="tabs">
    <button type="button" class="tabbtn active" id="tabBtnClientes" onclick="switchAdminTab('clientes')">Clientes</button>
    ${staff.role === 'superadmin' ? `<button type="button" class="tabbtn" id="tabBtnRegistro" onclick="switchAdminTab('registro')">Interfaz editable</button>` : ''}
    <button type="button" class="tabbtn" id="tabBtnUsuarios" onclick="switchAdminTab('usuarios')">Usuarios</button>
  </div>

  <!-- PESTAÑA CLIENTES -->
  <div id="tabClientes" class="panel">
    <h2>Clientes registrados</h2>
    <div class="btnrow">
      <button type="button" class="btn-excel" onclick="downloadExcel()">⬇ Descargar Excel</button>
      <button type="button" style="background:#16321f;" onclick="showAddCustomerModal()">+ Agregar cliente</button>

    </div>
    <div class="overflow-x">
      <table>
        <thead>
          <tr>
            <th>RUT</th>
            <th>Nombre Apellido</th>
            <th>Fecha Nacimiento</th>
            <th>Correo</th>
            <th>Compras</th>
            <th>Marcas</th>
            <th>Premios</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody id="custBody"></tbody>
      </table>
    </div>
    <div id="detailPanel" style="display:none;margin-top:20px;border-top:2px solid #eee;padding-top:16px;"></div>
  </div>

  <!-- PESTAÑA INTERFAZ EDITABLE -->
  <div id="tabRegistro" style="display:none;">
    <div class="panel" style="margin-bottom:12px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button type="button" id="btnEdLogin" onclick="showIface('login')" style="flex:1;background:#16321f;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;cursor:pointer;font-weight:600;">🔐 Editar Login</button>
        <button type="button" id="btnEdDiseno" onclick="switchAdminTab('diseno')" style="flex:1;background:#ddd;color:#333;border:none;border-radius:8px;padding:12px;font-size:14px;cursor:pointer;font-weight:600;">🎨 Diseño de tarjeta</button>
        <button type="button" id="btnEdRegistro" onclick="showIface('registro')" style="flex:1;background:#ddd;color:#333;border:none;border-radius:8px;padding:12px;font-size:14px;cursor:pointer;font-weight:600;">📋 Editar Registro</button>
      </div>
    </div>

    <!-- SUB-PANEL DISEÑO DE TARJETA -->
    <div id="ifaceDiseno" class="panel" style="display:none;">
      <h2>Diseño de tarjeta</h2>
      <p style="font-size:13px;color:#666;margin-bottom:16px;">Edita el diseño en la pestaña <strong>Diseño de tarjeta</strong> — los cambios se reflejan en tiempo real en la tarjeta del cliente.</p>
      <button type="button" onclick="switchAdminTab('diseno')" style="background:#16321f;color:#fff;border:none;border-radius:8px;padding:12px 20px;font-size:14px;cursor:pointer;font-weight:600;margin-top:0;width:auto;">Ir al editor de diseño →</button>
    </div>

    <!-- SUB-PANEL LOGIN -->
    <div id="ifaceLogin" class="panel">
      <div class="design-wrap">
        <div class="formcol">
          <h2>Editar Login</h2>
          <form onsubmit="saveLoginConfig(event)">
            <label>Logo (URL)</label>
            <input type="url" id="lc_logo" placeholder="https://i.imgur.com/..." oninput="updateLoginPreview()">
            <label>Tamaño del logo (px)</label>
            <div class="rangerow">
              <input type="range" id="lc_logo_width" min="40" max="200" value="120" oninput="syncRange(this,'lc_logo_width_val');updateLoginPreview()">
              <span class="rangeval" id="lc_logo_width_val">120px</span>
            </div>
            <label>Color de fondo</label>
            <div class="colorrow">
              <input type="color" id="lc_bg_picker" oninput="syncLoginColor('bg',this.value)">
              <input type="text" id="lc_bg_color" oninput="syncLoginColorText('bg',this.value)">
            </div>
            <label>Color del botón</label>
            <div class="colorrow">
              <input type="color" id="lc_btn_picker" oninput="syncLoginColor('btn',this.value)">
              <input type="text" id="lc_btn_color" oninput="syncLoginColorText('btn',this.value)">
            </div>
            <label>Texto del botón</label>
            <input type="text" id="lc_btn_texto" oninput="updateLoginPreview()">
            <button type="submit" style="margin-top:18px;">Guardar Login</button>
            <div class="msg" id="lc_msg"></div>
          </form>
        </div>
        <div class="previewcol" style="width:200px;">
          <div style="font-size:12px;font-weight:600;color:#555;margin-bottom:8px;">Vista previa</div>
          <div id="lp_wrap" style="border-radius:10px;padding:16px;width:180px;font-size:12px;">
            <div style="text-align:center;margin-bottom:10px;"><img id="lp_logo" style="max-width:160px;max-height:100px;object-fit:contain;"></div>
            <div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:10px;color:#333;">Acceso al sistema</div>
            <div style="background:#eee;border-radius:5px;height:28px;margin-bottom:6px;"></div>
            <div style="background:#eee;border-radius:5px;height:28px;margin-bottom:10px;"></div>
            <div id="lp_btn" style="border-radius:6px;padding:8px;text-align:center;color:#fff;font-weight:700;font-size:12px;"></div>
          </div>
          <div style="font-size:11px;color:#999;margin-top:8px;">Vista previa en vivo</div>
        </div>
      </div>
    </div>

    <!-- SUB-PANEL REGISTRO -->
    <div id="ifaceRegistro" class="panel" style="display:none;">
      <div class="design-wrap">
        <div class="formcol">
          <h2>Editar Registro</h2>
          <form onsubmit="saveRegistroConfig(event)">
            <label>Logo (URL)</label>
            <input type="url" id="rc_logo" placeholder="https://i.imgur.com/..." oninput="updateRegPreview()">
            <label>Tamaño del logo (px)</label>
            <div class="rangerow">
              <input type="range" id="rc_logo_width" min="40" max="200" value="140" oninput="syncRange(this,'rc_logo_width_val');updateRegPreview()">
              <span class="rangeval" id="rc_logo_width_val">140px</span>
            </div>
            <label>Título</label>
            <input type="text" id="rc_titulo" oninput="updateRegPreview()">
            <label>Subtítulo</label>
            <input type="text" id="rc_subtitulo" oninput="updateRegPreview()">
            <label>Color de fondo</label>
            <div class="colorrow">
              <input type="color" id="rc_bg_picker" oninput="syncRegBgColor(this.value)">
              <input type="text" id="rc_bg_color" oninput="syncRegBgColorText(this.value)">
            </div>
            <label>Color del botón</label>
            <div class="colorrow">
              <input type="color" id="rc_btn_color_picker" oninput="syncRegColor(this.value)">
              <input type="text" id="rc_btn_color" oninput="syncRegColorText(this.value)">
            </div>
            <label>Texto del botón</label>
            <input type="text" id="rc_btn_texto" oninput="updateRegPreview()">
            <label style="margin-top:18px;">Campos visibles</label>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
              <label style="margin:0;display:flex;align-items:center;gap:8px;font-weight:400;font-size:14px;"><input type="checkbox" id="rc_rut" onchange="updateRegPreview()"> RUT</label>
              <label style="margin:0;display:flex;align-items:center;gap:8px;font-weight:400;font-size:14px;"><input type="checkbox" id="rc_nombre" onchange="updateRegPreview()"> Nombre</label>
              <label style="margin:0;display:flex;align-items:center;gap:8px;font-weight:400;font-size:14px;"><input type="checkbox" id="rc_apellido" onchange="updateRegPreview()"> Apellido</label>
              <label style="margin:0;display:flex;align-items:center;gap:8px;font-weight:400;font-size:14px;"><input type="checkbox" id="rc_correo" onchange="updateRegPreview()"> Correo electrónico</label>
              <label style="margin:0;display:flex;align-items:center;gap:8px;font-weight:400;font-size:14px;"><input type="checkbox" id="rc_telefono" onchange="updateRegPreview()"> Teléfono</label>
              <label style="margin:0;display:flex;align-items:center;gap:8px;font-weight:400;font-size:14px;"><input type="checkbox" id="rc_nacimiento" onchange="updateRegPreview()"> Fecha de nacimiento</label>
            </div>
            <label style="margin-top:18px;">Texto checkbox 1</label>
            <textarea id="rc_chk1" rows="3" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px;resize:vertical;" oninput="updateRegPreview()"></textarea>
            <label>Texto checkbox 2</label>
            <textarea id="rc_chk2" rows="4" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px;resize:vertical;" oninput="updateRegPreview()"></textarea>
            <button type="button" onclick="showIface('tyc')" style="margin-top:14px;width:100%;background:#444;color:#fff;border:none;border-radius:6px;padding:10px;cursor:pointer;font-size:14px;">📄 Editar Términos y Condiciones</button>
            <button type="submit" style="margin-top:10px;">Guardar Registro</button>
            <div class="msg" id="rc_msg"></div>
          </form>
        </div>
        <div class="previewcol" style="width:220px;">
          <div style="font-size:12px;font-weight:600;color:#555;margin-bottom:8px;">Vista previa</div>
          <div id="reg_preview" style="border-radius:12px;padding:14px;width:200px;font-size:11px;">
            <div style="text-align:center;margin-bottom:8px;"><img id="rp_logo" style="max-width:160px;max-height:100px;object-fit:contain;"></div>
            <div id="rp_titulo" style="font-size:13px;font-weight:700;text-align:center;margin-bottom:2px;"></div>
            <div id="rp_sub" style="font-size:10px;color:#666;text-align:center;margin-bottom:10px;"></div>
            <div id="rp_rut_row"    style="background:#ddd;border-radius:5px;height:18px;margin-bottom:4px;font-size:9px;color:#666;padding:2px 6px;">RUT</div>
            <div id="rp_nombre_row" style="background:#ddd;border-radius:5px;height:18px;margin-bottom:4px;font-size:9px;color:#666;padding:2px 6px;">Nombre</div>
            <div id="rp_apell_row"  style="background:#ddd;border-radius:5px;height:18px;margin-bottom:4px;font-size:9px;color:#666;padding:2px 6px;">Apellido</div>
            <div id="rp_email_row"  style="background:#ddd;border-radius:5px;height:18px;margin-bottom:4px;font-size:9px;color:#666;padding:2px 6px;">Correo</div>
            <div id="rp_tel_row"    style="background:#ddd;border-radius:5px;height:18px;margin-bottom:4px;font-size:9px;color:#666;padding:2px 6px;">Teléfono</div>
            <div id="rp_nac_row"    style="background:#ddd;border-radius:5px;height:18px;margin-bottom:8px;font-size:9px;color:#666;padding:2px 6px;">Fecha de nacimiento</div>
            <div style="display:flex;gap:5px;margin-bottom:4px;font-size:9px;color:#444;align-items:flex-start;"><div style="width:10px;height:10px;min-width:10px;border:1px solid #aaa;border-radius:2px;margin-top:1px;"></div><span id="rp_chk1" style="line-height:1.3;"></span></div>
            <div style="display:flex;gap:5px;margin-bottom:8px;font-size:9px;color:#444;align-items:flex-start;"><div style="width:10px;height:10px;min-width:10px;border:1px solid #aaa;border-radius:2px;margin-top:1px;"></div><span id="rp_chk2" style="line-height:1.3;"></span></div>
            <div id="rp_btn" style="border-radius:6px;padding:7px;text-align:center;color:#fff;font-weight:700;font-size:11px;"></div>
          </div>
          <div style="font-size:11px;color:#999;margin-top:8px;">Vista previa en vivo</div>
        </div>
      </div>
    </div>

    <!-- SUB-PANEL TYC -->
    <div id="ifaceTyc" class="panel" style="display:none;">
      <h2>Editar Términos y Condiciones</h2>
      <p style="font-size:13px;color:#666;margin-bottom:20px;">Estos cambios se reflejan inmediatamente en <a href="/terminos" target="_blank" style="color:#16321f;">/terminos</a></p>
      <form onsubmit="saveTycConfig(event)">

        <h3 style="font-size:14px;color:#333;margin:0 0 12px;border-bottom:1px solid #eee;padding-bottom:6px;">🎨 Apariencia</h3>
        <label>Logo (URL)</label>
        <input type="url" id="tyc_logo" placeholder="https://i.imgur.com/..." oninput="updateTycPreview()">
        <label>Tamaño del logo (px)</label>
        <div class="rangerow">
          <input type="range" id="tyc_logo_width" min="40" max="300" value="120" oninput="syncRange(this,'tyc_logo_width_val');updateTycPreview()">
          <span class="rangeval" id="tyc_logo_width_val">120px</span><div style="margin-top:12px;padding:16px;border:1px solid #eee;border-radius:8px;background:#fafafa;"><div style="font-size:12px;font-weight:600;color:#555;margin-bottom:10px;">Vista previa del logo</div><div id="tyc_preview_wrap" style="border-radius:8px;padding:16px;text-align:center;"><img id="typ_logo" style="object-fit:contain;display:none;"></div></div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;">
          <div style="flex:1;min-width:140px;">
            <label>Color de fondo</label>
            <div class="colorrow"><input type="color" id="tyc_bg_picker" oninput="syncTycColor('bg',this.value)"><input type="text" id="tyc_bg_color" oninput="syncTycColorText('bg',this.value)"></div>
          </div>
          <div style="flex:1;min-width:140px;">
            <label>Color tarjeta</label>
            <div class="colorrow"><input type="color" id="tyc_card_picker" oninput="syncTycColor('card',this.value)"><input type="text" id="tyc_card_color" oninput="syncTycColorText('card',this.value)"></div>
          </div>
          <div style="flex:1;min-width:140px;">
            <label>Color título</label>
            <div class="colorrow"><input type="color" id="tyc_title_picker" oninput="syncTycColor('title',this.value)"><input type="text" id="tyc_title_color" oninput="syncTycColorText('title',this.value)"></div>
          </div>
          <div style="flex:1;min-width:140px;">
            <label>Color subtítulos (H2)</label>
            <div class="colorrow"><input type="color" id="tyc_h2_picker" oninput="syncTycColor('h2',this.value)"><input type="text" id="tyc_h2_color" oninput="syncTycColorText('h2',this.value)"></div>
          </div>
          <div style="flex:1;min-width:140px;">
            <label>Color texto</label>
            <div class="colorrow"><input type="color" id="tyc_text_picker" oninput="syncTycColor('text',this.value)"><input type="text" id="tyc_text_color" oninput="syncTycColorText('text',this.value)"></div>
          </div>
        </div>

        <h3 style="font-size:14px;color:#333;margin:20px 0 12px;border-bottom:1px solid #eee;padding-bottom:6px;">🏢 Datos de la empresa</h3>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;"><label>Razón social</label><input type="text" id="tyc_razon_social"></div>
          <div style="flex:1;min-width:140px;"><label>RUT</label><input type="text" id="tyc_rut"></div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;">
          <div style="flex:1;min-width:160px;"><label>Nombre de fantasía</label><input type="text" id="tyc_nombre_fantasia"></div>
          <div style="flex:1;min-width:200px;"><label>Domicilio</label><input type="text" id="tyc_domicilio"></div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;">
          <div style="flex:1;min-width:240px;"><label>Título principal</label><input type="text" id="tyc_titulo"></div>
          <div style="flex:1;min-width:160px;"><label>Fecha de actualización</label><input type="text" id="tyc_fecha"></div>
        </div>

        <h3 style="font-size:14px;color:#333;margin:20px 0 12px;border-bottom:1px solid #eee;padding-bottom:6px;">📝 Secciones</h3>
        ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `
        <div style="margin-bottom:14px;">
          <label>Título sección ${n}</label>
          <input type="text" id="tyc_s${n}_titulo">
          <label style="margin-top:6px;">Texto sección ${n}</label>
          <textarea id="tyc_s${n}_texto" rows="3" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px;resize:vertical;margin-top:4px;"></textarea>
        </div>`).join('')}

        <button type="submit" style="margin-top:10px;">Guardar Términos y Condiciones</button>
        <div class="msg" id="tyc_config_msg"></div>
      </form>
    </div>

    <!-- MODAL TYC (legacy) -->
    <div id="tycModal" style="display:none;"></div>
  </div>

  <!-- PESTAÑA DISEÑO -->
  <div id="tabDiseno" style="display:none;"><div class="panel" style="margin-bottom:12px;"><div style="display:flex;gap:12px;flex-wrap:wrap;"><button type="button" onclick="switchAdminTab('registro');showIface('login')" style="flex:1;background:#ddd;color:#333;border:none;border-radius:8px;padding:12px;font-size:14px;cursor:pointer;font-weight:600;">🔐 Editar Login</button><button type="button" onclick="switchAdminTab('diseno')" style="flex:1;background:#16321f;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;cursor:pointer;font-weight:600;">🎨 Diseño de tarjeta</button><button type="button" onclick="switchAdminTab('registro');showIface('registro')" style="flex:1;background:#ddd;color:#333;border:none;border-radius:8px;padding:12px;font-size:14px;cursor:pointer;font-weight:600;">📋 Editar Registro</button></div></div>
  ${programs.map((p) => `
  <div class="panel" id="panel-design-${p.id}" data-prog="${p.id}">
    <div class="design-wrap">
      <div class="formcol">
        <h2>Diseño de tarjeta</h2>
        <form onsubmit="saveProgram(event, ${p.id})">
          <label>Nombre del programa</label>
          <input type="text" name="name" value="${p.name || ''}" required>
          <label>Cantidad de marcas requeridas</label>
          <input type="number" name="required_stamps" value="${p.required_stamps || 10}" min="1" max="30" oninput="updatePreview(${p.id})">
          <label>URL del logo</label>
          <input type="url" name="logo_url" value="${p.logo_url || ''}" oninput="updatePreview(${p.id})">
          <label>Tamaño del logo (máximo 76px)</label>
          <div class="rangerow">
            <input type="range" name="logo_width" min="50" max="76" value="${p.logo_width || 76}" oninput="syncRange(this,'logo_width_val_${p.id}');updatePreview(${p.id})">
            <span class="rangeval" id="logo_width_val_${p.id}">${p.logo_width || 76}px</span>
          </div>
          <label>Color principal</label>
          <div class="colorrow">
            <input type="color" value="${p.primary_color || '#000000'}" oninput="syncColor(${p.id},'primary_color',this.value)">
            <input type="text" name="primary_color" value="${p.primary_color || '#000000'}" oninput="syncColorFromText(${p.id},'primary_color',this.value)">
          </div>
          <label>Color secundario</label>
          <div class="colorrow">
            <input type="color" value="${p.secondary_color || '#0f1115'}" oninput="syncColor(${p.id},'secondary_color',this.value)">
            <input type="text" name="secondary_color" value="${p.secondary_color || '#0f1115'}" oninput="syncColorFromText(${p.id},'secondary_color',this.value)">
          </div>
          <label>Ícono de marca</label>
          <input type="text" id="stamp-icon-${p.id}" name="stamp_icon" value="${p.stamp_icon || '★'}" oninput="updatePreview(${p.id})">
          <div class="iconrow">
            ${['★', '✦', '✱', '✓', '✪'].map((ic) => `<button type="button" class="iconbtn ${(p.stamp_icon || '★') === ic ? 'active' : ''}" onclick="document.getElementById('stamp-icon-${p.id}').value='${ic}';updatePreview(${p.id})">${ic}</button>`).join('')}
          </div>
          <label>Color de fondo del ícono (marca completada)</label>
          <div class="colorrow">
            <input type="color" value="${p.stamp_color || '#d62828'}" oninput="syncColor(${p.id},'stamp_color',this.value)">
            <input type="text" name="stamp_color" value="${p.stamp_color || '#d62828'}" oninput="syncColorFromText(${p.id},'stamp_color',this.value)">
          </div>
          <label>Tamaño del ícono (máximo 25px)</label>
          <div class="rangerow">
            <input type="range" name="stamp_size" min="10" max="25" value="${p.stamp_size || 22}" oninput="syncRange(this,'stamp_size_val_${p.id}');updatePreview(${p.id})">
            <span class="rangeval" id="stamp_size_val_${p.id}">${p.stamp_size || 22}px</span>
          </div>
          <button type="submit">Guardar diseño</button>
          <div class="msg" id="msg-${p.id}"></div>
        </form>
      </div>
      <div class="previewcol">
        <div class="preview-card" id="preview-card-${p.id}" style="background:${p.primary_color || '#000'};">
          <img id="preview-logo-${p.id}" src="${p.logo_url || ''}" style="width:min(${p.logo_width || 76}px,80%);max-height:60px;object-fit:contain;display:${p.logo_url ? 'block' : 'none'};">
          <div class="preview-brand" id="preview-brand-${p.id}">${p.name || ''}</div>
          <div class="preview-qr">QR</div>
          <div class="preview-grid" id="preview-grid-${p.id}"></div>
          <div class="preview-progress">VISITAS: 0 / ${p.required_stamps || 10}</div>
        </div>
        <div style="font-size:11px;color:#999;margin-top:8px;">Vista previa en vivo</div>
      </div>
    </div>
  </div>`).join('')}
  </div>

  <!-- PESTAÑA USUARIOS -->
  <div id="tabUsuarios" style="display:none;">
    <div class="panel">
      <h2>Gestión de usuarios</h2>
      <div class="btnrow">
        <button type="button" onclick="showCreateUserModal()" style="background:#16321f;">+ Nuevo usuario</button>
      </div>
      <div class="overflow-x">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody id="usersBody"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>
<script src="/js/util.js"></script>
<script src="/js/auth.js"></script>
<script>
const CURRENT_ROLE = document.body.dataset.role || 'admin';
function switchAdminTab(tab) {
  ['clientes','diseno','registro','usuarios'].forEach(t => {
    const btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
    const panel = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    const navActive = (tab === t) || (tab === 'diseno' && t === 'registro'); if (btn) btn.className = 'tabbtn' + (navActive ? ' active' : '');
    if (panel) panel.style.display = tab === t ? 'block' : 'none';
  });
  if (tab === 'clientes') loadCustomers();
  if (tab === 'registro') showIface('login');
  if (tab === 'usuarios') loadUsers();
}

// ── Clientes ──────────────────────────────────────────────
async function loadCustomers() {
  const r = await fetch('/api/admin/customers');
  if (r.status === 401) { window.location.href = '/login'; return; }
  const rows = await r.json();
  const tbody = document.getElementById('custBody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;color:#999;">Sin clientes registrados todavía.</td></tr>'; return; }
  const allData = await (await fetch('/api/admin/all-data')).json();
  const purchaseMap = {};
  (allData.purchases || []).forEach(p => {
    if (!purchaseMap[p.customer_id]) purchaseMap[p.customer_id] = [];
    purchaseMap[p.customer_id].push(p.receipt_number);
  });
  tbody.innerHTML = rows.map(c => {
    const boletas = purchaseMap[c.id] || [];
    return '<tr>' +
      '<td>' + escapeHtml(c.rut) + '</td>' +
      '<td>' + escapeHtml(c.first_name) + ' ' + escapeHtml(c.last_name) + '</td>' +
      '<td>' + (c.birth_date ? c.birth_date.split('-').reverse().join('-') : '—') + '</td>' +
      '<td>' + escapeHtml(c.email || '') + '</td>' +
      '<td style="text-align:center;">' + boletas.length + '</td>' +
      '<td>' + (c.current_stamps != null ? c.current_stamps + '/' + (c.required_stamps||10) : '0/10') + '</td>' +
      '<td style="text-align:center;">' + Math.floor(boletas.length / (c.required_stamps||10)) + '</td>' +
      '<td><button class="actbtn" onclick="showDetail(' + c.id + ')">Detalle</button>' +
      '<button class="actbtn" onclick="showEditCustomerModal(' + c.id + ')">Editar</button>' +
      '<button class="actbtn delbtn" onclick="delCustomer(' + c.id + ')">Eliminar</button></td>' +
    '</tr>';
  }).join('');
}

async function showDetail(id) {
  const panel = document.getElementById('detailPanel');
  panel.style.display = 'block';
  panel.innerHTML = 'Cargando...';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const r = await fetch('/api/admin/customers/' + id + '/detail');
  const d = await r.json();
  if (!r.ok) { panel.innerHTML = d.error || 'Error'; return; }
  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const bestHour = d.hourPattern[0] ? d.hourPattern[0].hora_del_dia + ':00 (' + d.hourPattern[0].veces + ' veces)' : '—';
  const bestDay  = d.dayPattern[0]  ? DAYS[d.dayPattern[0].dow] + ' (' + d.dayPattern[0].veces + ' veces)' : '—';
  panel.innerHTML =
    '<h3>' + escapeHtml(d.customer.first_name) + ' ' + escapeHtml(d.customer.last_name) + ' (' + escapeHtml(d.customer.rut) + ')</h3>' +
    '<button type="button" onclick="closeDetail()" style="width:auto;background:#888;margin-bottom:14px;">Cerrar</button>' +

    '<h4 style="margin:0 0 8px;">Boletas registradas</h4>' +
    '<table><thead><tr><th>N° Boleta</th><th>Fecha</th><th>Hora</th><th>Monto</th></tr></thead><tbody>' +
    (d.purchases.length ? d.purchases.map(p => '<tr><td>' + p.documento + '</td><td>' + (p.fecha || p.purchase_date.slice(0,10)) + '</td><td>' + (p.hora || '—') + '</td><td>$' + Math.round(p.monto).toLocaleString('es-CL') + '</td></tr>').join('') : '<tr><td colspan="4" style="color:#999;">Sin boletas.</td></tr>') +
    '</tbody></table>';
}

function closeDetail() {
  document.getElementById('detailPanel').style.display = 'none';
}

async function delCustomer(id) {
  if (!confirm('¿Eliminar este cliente y toda su información?')) return;
  const r = await fetch('/api/admin/customers/' + id, { method: 'DELETE' });
  if (r.ok) loadCustomers(); else alert('Error al eliminar');
}

async function downloadExcel() {
  const r = await fetch('/api/admin/customers');
  const rows = await r.json();
  const allData = await (await fetch('/api/admin/all-data')).json();
  const purchaseMap = {};
  (allData.purchases || []).forEach(p => {
    if (!purchaseMap[p.customer_id]) purchaseMap[p.customer_id] = [];
    purchaseMap[p.customer_id].push(p.receipt_number);
  });
  const data = [];
  rows.forEach(c => {
    const boletas = purchaseMap[c.id] || [];
    const fechaFmt = c.birth_date ? c.birth_date.split('-').reverse().join('-') : '';
    if (boletas.length === 0) {
      data.push({
        'RUT': c.rut,
        'Nombre Apellido': c.first_name + ' ' + c.last_name,
        'Fecha Nacimiento': fechaFmt,
        'Correo': c.email || '',
        'N° Boleta': '',
        'Marca': '',
        'Premio': ''
      });
    } else {
      boletas.forEach((boleta, idx) => {
        const numCompra = idx + 1;
        data.push({
          'RUT': c.rut,
          'Nombre Apellido': c.first_name + ' ' + c.last_name,
          'Fecha Nacimiento': fechaFmt,
          'Correo': c.email || '',
          'N° Boleta': boleta,
          'Marca': 1,
          'Premio': numCompra % 10 === 0 ? 'SI' : ''
        });
      });
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Clientes');
  XLSX.writeFile(wb, 'clientes-getit-' + new Date().toISOString().slice(0,10) + '.xlsx');
}

// ── Diseño ────────────────────────────────────────────────
function syncRange(input, valId) {
  document.getElementById(valId).textContent = input.value + 'px';
}
function syncColor(id, field, hexVal) {
  document.querySelector('#panel-design-' + id + ' [name=' + field + ']:not([type=color])').value = hexVal;
  updatePreview(id);
}
function syncColorFromText(id, field, val) {
  let v = val.trim();
  if (v && !v.startsWith('#')) v = '#' + v;
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
    document.querySelector('#panel-design-' + id + ' [name=' + field + '][type=color]').value = v;
    updatePreview(id);
  }
}
function updatePreview(id) {
  const form = document.querySelector('[data-prog="' + id + '"] form');
  const primary = form.primary_color.value || '#000';
  const stampColor = form.stamp_color.value || '#d62828';
  const stampSize = parseInt(form.stamp_size.value, 10) || 22;
  const logoUrl = form.logo_url.value.trim();
  const logoWidth = form.logo_width.value;
  const stamps = parseInt(form.required_stamps.value, 10) || 10;
  const icon = document.getElementById('stamp-icon-' + id).value || '★';
  const name = form.name.value || '';
  const card = document.getElementById('preview-card-' + id);
  if (/^#[0-9A-Fa-f]{6}$/.test(primary)) card.style.background = primary;
  const logoImg = document.getElementById('preview-logo-' + id);
  logoImg.src = logoUrl;
  logoImg.style.display = logoUrl ? 'block' : 'none';
  logoImg.style.width = 'min(' + logoWidth + 'px, 80%)';
  document.getElementById('preview-brand-' + id).textContent = name;
  const grid = document.getElementById('preview-grid-' + id);
  grid.innerHTML = '';
  for (let i = 0; i < Math.min(stamps, 15); i++) {
    const div = document.createElement('div');
    div.className = 'preview-stamp' + (i === 0 ? ' filled' : '');
    if (i === 0) { div.style.background = stampColor; }
    div.style.fontSize = Math.min(stampSize, 25) + 'px';
    div.textContent = i === 0 ? icon : '';
    grid.appendChild(div);
  }
}

async function saveProgram(e, id) {
  e.preventDefault();
  const f = e.target;
  const body = {
    name: f.name.value, required_stamps: parseInt(f.required_stamps.value,10),
    logo_url: f.logo_url.value.trim(), logo_width: parseInt(f.logo_width.value,10),
    primary_color: f.primary_color.value, secondary_color: f.secondary_color.value,
    stamp_icon: f.stamp_icon.value, stamp_color: f.stamp_color.value,
    stamp_size: parseInt(f.stamp_size.value,10)
  };
  const r = await fetch('/api/admin/programs/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const msg = document.getElementById('msg-' + id);
  msg.textContent = r.ok ? '✓ Diseño guardado.' : 'Error al guardar.';
  msg.style.color = r.ok ? '#16321f' : '#a01818';
}

async function loadRegistroConfig() {
  const r = await fetch('/api/admin/registro-config');
  const cfg = await r.json();
  document.getElementById('rc_logo').value = cfg.logo_url || '';
  if (cfg.logo_width) { var lw=document.getElementById('rc_logo_width'); if(lw){ lw.value=cfg.logo_width; document.getElementById('rc_logo_width_val').textContent=cfg.logo_width+'px'; } }
  document.getElementById('rc_titulo').value = cfg.titulo || '';
  document.getElementById('rc_subtitulo').value = cfg.subtitulo || '';
  document.getElementById('rc_bg_color').value = cfg.bg_color || '#f4f4f5';
  document.getElementById('rc_bg_picker').value = cfg.bg_color || '#f4f4f5';
  document.getElementById('rc_btn_color').value = cfg.btn_color || '#16321f';
  document.getElementById('rc_btn_color_picker').value = cfg.btn_color || '#16321f';
  document.getElementById('rc_btn_texto').value = cfg.btn_texto || '';
  document.getElementById('rc_rut').checked      = cfg.campo_rut !== 0;
  document.getElementById('rc_nombre').checked   = cfg.campo_nombre !== 0;
  document.getElementById('rc_apellido').checked = cfg.campo_apellido !== 0;
  document.getElementById('rc_correo').checked   = cfg.campo_correo !== 0;
  document.getElementById('rc_telefono').checked = cfg.campo_telefono !== 0;
  document.getElementById('rc_nacimiento').checked = cfg.campo_nacimiento !== 0;
  document.getElementById('rc_chk1').value = cfg.chk1_texto || '';
  document.getElementById('rc_chk2').value = cfg.chk2_texto || '';

  updateRegPreview();
}

async function loadLoginConfig() {
  const r = await fetch('/api/admin/login-config');
  const cfg = await r.json();
  document.getElementById('lc_logo').value = cfg.logo_url || '';
  if (cfg.logo_width) { var lw=document.getElementById('lc_logo_width'); if(lw){ lw.value=cfg.logo_width; document.getElementById('lc_logo_width_val').textContent=cfg.logo_width+'px'; } }
  document.getElementById('lc_bg_color').value = cfg.bg_color || '#f4f4f5';
  document.getElementById('lc_bg_picker').value = cfg.bg_color || '#f4f4f5';
  document.getElementById('lc_btn_color').value = cfg.btn_color || '#16321f';
  document.getElementById('lc_btn_picker').value = cfg.btn_color || '#16321f';
  document.getElementById('lc_btn_texto').value = cfg.btn_texto || '';
  updateLoginPreview();
}

function showIface(which) {
  ['login','diseno','registro','tyc'].forEach(function(t) {
    var el = document.getElementById('iface' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.style.display = 'none';
    var btn = document.getElementById('btnEd' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) { btn.style.background = '#ddd'; btn.style.color = '#333'; }
  });
  var active = document.getElementById('iface' + which.charAt(0).toUpperCase() + which.slice(1));
  if (active) active.style.display = 'block';
  var activeBtn = document.getElementById('btnEd' + which.charAt(0).toUpperCase() + which.slice(1));
  if (activeBtn) { activeBtn.style.background = '#16321f'; activeBtn.style.color = '#fff'; }
  if (which === 'login') loadLoginConfig();
  if (which === 'registro') loadRegistroConfig();
  if (which === 'tyc') loadTycConfig();
}

// ── Login preview ──
function syncLoginColor(field, val) {
  if (field === 'bg') { document.getElementById('lc_bg_color').value = val; }
  else { document.getElementById('lc_btn_color').value = val; }
  updateLoginPreview();
}
function syncLoginColorText(field, val) {
  const v = val.trim().startsWith('#') ? val.trim() : '#' + val.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
    if (field === 'bg') document.getElementById('lc_bg_picker').value = v;
    else document.getElementById('lc_btn_picker').value = v;
    updateLoginPreview();
  }
}
function updateLoginPreview() {
  const logo = document.getElementById('lc_logo').value;
  const logoW = document.getElementById('lc_logo_width').value || 120;
  const bg = document.getElementById('lc_bg_color').value || '#f4f4f5';
  const btn = document.getElementById('lc_btn_color').value || '#16321f';
  const texto = document.getElementById('lc_btn_texto').value || 'Ingresar';
  document.getElementById('lp_wrap').style.background = bg;
  const img = document.getElementById('lp_logo');
  img.src = logo; img.style.display = logo ? 'inline' : 'none'; img.style.maxWidth = logoW + 'px';
  const b = document.getElementById('lp_btn');
  b.style.background = btn; b.textContent = texto;
}
async function saveLoginConfig(e) {
  e.preventDefault();
  const body = {
    logo_url: document.getElementById('lc_logo').value.trim(),
    logo_width: parseInt(document.getElementById('lc_logo_width').value, 10) || 120,
    bg_color: document.getElementById('lc_bg_color').value.trim(),
    btn_color: document.getElementById('lc_btn_color').value.trim(),
    btn_texto: document.getElementById('lc_btn_texto').value.trim()
  };
  const r = await fetch('/api/admin/login-config', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const msg = document.getElementById('lc_msg');
  msg.textContent = r.ok ? '✓ Login actualizado.' : 'Error al guardar.';
  msg.style.color = r.ok ? '#16321f' : '#a01818';
}

// ── Registro preview ──
function syncRegBgColor(val) { document.getElementById('rc_bg_color').value = val; updateRegPreview(); }
function syncRegBgColorText(val) {
  const v = val.trim().startsWith('#') ? val.trim() : '#' + val.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) { document.getElementById('rc_bg_picker').value = v; updateRegPreview(); }
}
function syncRegColor(val) { document.getElementById('rc_btn_color').value = val; updateRegPreview(); }
function syncRegColorText(val) {
  const v = val.trim().startsWith('#') ? val.trim() : '#' + val.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) { document.getElementById('rc_btn_color_picker').value = v; updateRegPreview(); }
}
function updateRegPreview() {
  const logo = document.getElementById('rc_logo').value;
  const titulo = document.getElementById('rc_titulo').value;
  const sub = document.getElementById('rc_subtitulo').value;
  const bg = document.getElementById('rc_bg_color').value || '#f4f4f5';
  const btnColor = document.getElementById('rc_btn_color').value || '#16321f';
  const btnTexto = document.getElementById('rc_btn_texto').value;
  const showRut    = document.getElementById('rc_rut').checked;
  const showNombre = document.getElementById('rc_nombre').checked;
  const showApell  = document.getElementById('rc_apellido').checked;
  const showEmail  = document.getElementById('rc_correo').checked;
  const showTel    = document.getElementById('rc_telefono').checked;
  const showNac    = document.getElementById('rc_nacimiento').checked;
  const chk1 = document.getElementById('rc_chk1').value;
  const chk2 = document.getElementById('rc_chk2').value;
  document.getElementById('reg_preview').style.background = bg;
  const logoWR = document.getElementById('rc_logo_width') ? document.getElementById('rc_logo_width').value : 140;
  const img = document.getElementById('rp_logo');
  img.src = logo; img.style.display = logo ? 'inline' : 'none'; img.style.maxWidth = logoWR + 'px';
  document.getElementById('rp_titulo').textContent = titulo;
  document.getElementById('rp_sub').textContent = sub;
  document.getElementById('rp_rut_row').style.display     = showRut    ? 'block' : 'none';
  document.getElementById('rp_nombre_row').style.display  = showNombre ? 'block' : 'none';
  document.getElementById('rp_apell_row').style.display   = showApell  ? 'block' : 'none';
  document.getElementById('rp_email_row').style.display   = showEmail  ? 'block' : 'none';
  document.getElementById('rp_tel_row').style.display     = showTel    ? 'block' : 'none';
  document.getElementById('rp_nac_row').style.display     = showNac    ? 'block' : 'none';
  document.getElementById('rp_chk1').textContent = chk1.slice(0,55) + (chk1.length > 55 ? '...' : '');
  document.getElementById('rp_chk2').textContent = chk2.slice(0,55) + (chk2.length > 55 ? '...' : '');
  const btn = document.getElementById('rp_btn');
  btn.style.background = btnColor; btn.textContent = btnTexto;
}
async function saveRegistroConfig(e) {
  e.preventDefault();
  const body = {
    logo_url:    document.getElementById('rc_logo').value.trim(),
    logo_width:  parseInt(document.getElementById('rc_logo_width').value, 10) || 140,
    titulo:      document.getElementById('rc_titulo').value.trim(),
    subtitulo:   document.getElementById('rc_subtitulo').value.trim(),
    bg_color:    document.getElementById('rc_bg_color').value.trim(),
    btn_color:   document.getElementById('rc_btn_color').value.trim(),
    btn_texto:   document.getElementById('rc_btn_texto').value.trim(),
    campo_rut:      document.getElementById('rc_rut').checked ? 1 : 0,
    campo_nombre:   document.getElementById('rc_nombre').checked ? 1 : 0,
    campo_apellido: document.getElementById('rc_apellido').checked ? 1 : 0,
    campo_correo:   document.getElementById('rc_correo').checked ? 1 : 0,
    campo_telefono: document.getElementById('rc_telefono').checked ? 1 : 0,
    campo_nacimiento: document.getElementById('rc_nacimiento').checked ? 1 : 0,
    chk1_texto:  document.getElementById('rc_chk1').value.trim(),
    chk2_texto:  document.getElementById('rc_chk2').value.trim()
  };
  const r = await fetch('/api/admin/registro-config', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const msg = document.getElementById('rc_msg');
  msg.textContent = r.ok ? '✓ Registro actualizado.' : 'Error al guardar.';
  msg.style.color = r.ok ? '#16321f' : '#a01818';
}

async function loadTycConfig() {
  const r = await fetch('/api/admin/tyc-config');
  const cfg = await r.json();
  const set = (id, val) => { var el=document.getElementById(id); if(el && val) el.value=val; };
  const setColor = (key, val) => {
    if (!val) return;
    var t=document.getElementById('tyc_'+key+'_color'), p=document.getElementById('tyc_'+key+'_picker');
    if(t) t.value=val; if(p && /^#[0-9A-Fa-f]{6}$/.test(val)) p.value=val;
  };
  set('tyc_logo', cfg.logo_url);
  if (cfg.logo_width) { var lw=document.getElementById('tyc_logo_width'); if(lw){ lw.value=cfg.logo_width; document.getElementById('tyc_logo_width_val').textContent=cfg.logo_width+'px'; } }
  setColor('bg', cfg.bg_color); setColor('card', cfg.card_color);
  setColor('title', cfg.title_color); setColor('h2', cfg.h2_color); setColor('text', cfg.text_color);
  set('tyc_razon_social', cfg.razon_social); set('tyc_rut', cfg.rut);
  set('tyc_nombre_fantasia', cfg.nombre_fantasia); set('tyc_domicilio', cfg.domicilio);
  set('tyc_titulo', cfg.titulo); set('tyc_fecha', cfg.fecha_actualizacion); updateTycPreview();
  [1,2,3,4,5,6,7,8].forEach(function(n) {
    set('tyc_s'+n+'_titulo', cfg['s'+n+'_titulo']);
    set('tyc_s'+n+'_texto', cfg['s'+n+'_texto']);
  });
}

function syncTycColor(key, val) {
  var t = document.getElementById('tyc_'+key+'_color');
  if(t) t.value = val;
}
function syncTycColorText(key, val) {
  var v = val.trim().startsWith('#') ? val.trim() : '#'+val.trim();
  if(/^#[0-9A-Fa-f]{6}$/.test(v)) {
    var p = document.getElementById('tyc_'+key+'_picker');
    if(p) p.value = v;
  }
}
function updateTycPreview() { var logo=document.getElementById('tyc_logo').value; var logoW=document.getElementById('tyc_logo_width').value||120; var bgc=document.getElementById('tyc_bg_color')?document.getElementById('tyc_bg_color').value:''; var wrap=document.getElementById('tyc_preview_wrap'); var img=document.getElementById('typ_logo'); if(wrap&&bgc) wrap.style.background=bgc; if(img){ img.src=logo; img.style.display=logo?'inline-block':'none'; img.style.maxWidth=logoW+'px'; img.style.maxHeight='140px'; } }

async function saveTycConfig(e) {
  e.preventDefault();
  var body = {
    logo_url: document.getElementById('tyc_logo').value.trim(),
    logo_width: parseInt(document.getElementById('tyc_logo_width').value, 10) || 120,
    bg_color: document.getElementById('tyc_bg_color').value.trim(),
    card_color: document.getElementById('tyc_card_color').value.trim(),
    title_color: document.getElementById('tyc_title_color').value.trim(),
    h2_color: document.getElementById('tyc_h2_color').value.trim(),
    text_color: document.getElementById('tyc_text_color').value.trim(),
    razon_social: document.getElementById('tyc_razon_social').value.trim(),
    rut: document.getElementById('tyc_rut').value.trim(),
    nombre_fantasia: document.getElementById('tyc_nombre_fantasia').value.trim(),
    domicilio: document.getElementById('tyc_domicilio').value.trim(),
    titulo: document.getElementById('tyc_titulo').value.trim(),
    fecha_actualizacion: document.getElementById('tyc_fecha').value.trim()
  };
  [1,2,3,4,5,6,7,8].forEach(function(n) {
    body['s'+n+'_titulo'] = document.getElementById('tyc_s'+n+'_titulo').value.trim();
    body['s'+n+'_texto']  = document.getElementById('tyc_s'+n+'_texto').value.trim();
  });
  var r = await fetch('/api/admin/tyc-config', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  var msg = document.getElementById('tyc_config_msg');
  msg.textContent = r.ok ? '✓ Términos guardados. Ver en /terminos' : 'Error al guardar.';
  msg.style.color = r.ok ? '#16321f' : '#a01818';
  if (r.ok) { msg.innerHTML += ' — <a href="/terminos" target="_blank" style="color:#16321f;">Ver TyC →</a>'; }
}

${programs.map((p) => `updatePreview(${p.id});`).join('\n')}
loadCustomers();

// ── Usuarios ──────────────────────────────────────────────
async function loadUsers() {
  const r = await fetch('/api/admin/users');
  if (r.status === 401) { window.location.href = '/login'; return; }
  const rows = await r.json();
  const tbody = document.getElementById('usersBody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;color:#999;">Sin usuarios.</td></tr>'; return; }
  const isSuperAdmin = CURRENT_ROLE === 'superadmin';

  window._usersMap = {};
  rows.forEach(u => { window._usersMap[u.id] = u; });

  tbody.innerHTML = rows.map(u => {
    const isSuperRow = u.role === 'superadmin';

    let roleBadge;
    if (isSuperRow && !isSuperAdmin) {
      roleBadge = '<span style="background:#555;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">Superior</span>';
    } else if (isSuperRow) {
      roleBadge = '<span style="background:#8B0000;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">Super Admin</span>';
    } else if (u.role === 'admin') {
      roleBadge = '<span style="background:#16321f;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">Admin</span>';
    } else {
      roleBadge = '<span style="background:#888;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">Cajero</span>';
    }

    const activeBadge = u.active
      ? '<span style="color:#16321f;font-weight:600;">✓ Activo</span>'
      : '<span style="color:#a01818;font-weight:600;">✗ Inactivo</span>';

    let acciones;
    if (isSuperRow && !isSuperAdmin) {
      acciones = '<span style="font-size:12px;color:#999;">— sin acceso —</span>';
    } else if (isSuperAdmin) {
      const toggleBtn = u.active
        ? '<button class="actbtn" onclick="toggleUser(' + u.id + ',0)">Desactivar</button>'
        : '<button class="actbtn" onclick="toggleUser(' + u.id + ',1)">Activar</button>';
      acciones = '<button class="actbtn" onclick="showEditUserModal(' + u.id + ')">Editar</button>' +
        '<button class="actbtn" onclick="showResetPwdModal(' + u.id + ')">Contraseña</button>' +
        toggleBtn +
        '<button class="actbtn delbtn" onclick="deleteUser(' + u.id + ')">Eliminar</button>';
    } else {
      const toggleBtn = u.active
        ? '<button class="actbtn" onclick="toggleUser(' + u.id + ',0)">Desactivar</button>'
        : '<button class="actbtn" onclick="toggleUser(' + u.id + ',1)">Activar</button>';
      acciones = '<button class="actbtn" onclick="showEditUserModal(' + u.id + ')">Editar</button>' +
        '<button class="actbtn" onclick="showResetPwdModal(' + u.id + ')">Contraseña</button>' +
        toggleBtn +
        '<button class="actbtn delbtn" onclick="deleteUser(' + u.id + ')">Eliminar</button>';
    }

    return '<tr>' +
      '<td>' + u.id + '</td>' +
      '<td>' + u.name + '</td>' +
      '<td><code>' + u.username + '</code></td>' +
      '<td>' + roleBadge + '</td>' +
      '<td>' + activeBadge + '</td>' +
      '<td>' + acciones + '</td>' +
    '</tr>';
  }).join('');
}


function showCreateUserModal() {
  var ov = document.createElement('div');
  ov.id = 'userModal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;box-sizing:border-box;';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:400px;width:100%;box-sizing:border-box;';
  var h = document.createElement('h3'); h.style.marginTop='0'; h.textContent='Nuevo usuario'; box.appendChild(h);
  function field(lbl, id, type, ph) {
    var l = document.createElement('label'); l.style.cssText='display:block;font-size:13px;font-weight:600;margin-bottom:4px;'; l.textContent=lbl; box.appendChild(l);
    var inp = document.createElement('input'); inp.id=id; inp.type=type; inp.placeholder=ph;
    inp.style.cssText='width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;margin-bottom:10px;'; box.appendChild(inp);
  }
  field('Nombre completo','um_name','text','Juan Pérez');
  field('Usuario (para iniciar sesión)','um_user','text','tienda_2');
  field('Contraseña','um_pwd','password','Mínimo 8 caracteres');
  var rl = document.createElement('label'); rl.style.cssText='display:block;font-size:13px;font-weight:600;margin-bottom:4px;'; rl.textContent='Rol'; box.appendChild(rl);
  var sel = document.createElement('select'); sel.id='um_role';
  sel.style.cssText='width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;margin-bottom:14px;';
  (CURRENT_ROLE === 'superadmin' ? [['cashier','Cajero'],['admin','Administrador'],['superadmin','Super Admin']] : [['cashier','Cajero'],['admin','Administrador']]).forEach(function(op){ var o=document.createElement('option'); o.value=op[0]; o.textContent=op[1]; sel.appendChild(o); }); box.appendChild(sel);
  var errDiv = document.createElement('div'); errDiv.id='um_err'; errDiv.style.cssText='color:#a01818;font-size:13px;margin-bottom:10px;display:none;'; box.appendChild(errDiv);
  var btnRow = document.createElement('div'); btnRow.style.cssText='display:flex;gap:8px;';
  var bOk = document.createElement('button'); bOk.type='button'; bOk.textContent='Crear usuario'; bOk.style.cssText='flex:1;padding:10px;background:#16321f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;'; bOk.onclick=submitCreateUser; btnRow.appendChild(bOk);
  var bCan = document.createElement('button'); bCan.type='button'; bCan.textContent='Cancelar'; bCan.style.cssText='flex:1;padding:10px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;'; bCan.onclick=closeUserModal; btnRow.appendChild(bCan);
  box.appendChild(btnRow); ov.appendChild(box); document.body.appendChild(ov);
  document.getElementById('um_name').focus();
}

function showEditUserModal(id) {
  var u = window._usersMap[id];
  if (!u) return;
  var ov = document.createElement('div');
  ov.id = 'userModal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;box-sizing:border-box;';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:400px;width:100%;box-sizing:border-box;';
  var h = document.createElement('h3'); h.style.marginTop='0'; h.textContent='Editar usuario'; box.appendChild(h);
  var infoDiv = document.createElement('p'); infoDiv.style.cssText='font-size:13px;color:#555;margin-bottom:12px;'; infoDiv.innerHTML='Usuario: <code>' + u.username + '</code>'; box.appendChild(infoDiv);
  var nl = document.createElement('label'); nl.style.cssText='display:block;font-size:13px;font-weight:600;margin-bottom:4px;'; nl.textContent='Nombre completo'; box.appendChild(nl);
  var ninp = document.createElement('input'); ninp.id='em_name'; ninp.type='text'; ninp.value=u.name;
  ninp.style.cssText='width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;margin-bottom:10px;'; box.appendChild(ninp);
  var rl = document.createElement('label'); rl.style.cssText='display:block;font-size:13px;font-weight:600;margin-bottom:4px;'; rl.textContent='Rol'; box.appendChild(rl);
  var sel = document.createElement('select'); sel.id='em_role';
  sel.style.cssText='width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;margin-bottom:14px;';
  (CURRENT_ROLE === 'superadmin' ? [['cashier','Cajero'],['admin','Administrador'],['superadmin','Super Admin']] : [['cashier','Cajero'],['admin','Administrador']]).forEach(function(op){ var o=document.createElement('option'); o.value=op[0]; o.textContent=op[1]; if(u.role===op[0]) o.selected=true; sel.appendChild(o); }); box.appendChild(sel);
  var errDiv = document.createElement('div'); errDiv.id='em_err'; errDiv.style.cssText='color:#a01818;font-size:13px;margin-bottom:10px;display:none;'; box.appendChild(errDiv);
  var btnRow = document.createElement('div'); btnRow.style.cssText='display:flex;gap:8px;';
  var bOk = document.createElement('button'); bOk.type='button'; bOk.textContent='Guardar'; bOk.style.cssText='flex:1;padding:10px;background:#16321f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;'; bOk.onclick=function(){ submitEditUser(u.id); }; btnRow.appendChild(bOk);
  var bCan = document.createElement('button'); bCan.type='button'; bCan.textContent='Cancelar'; bCan.style.cssText='flex:1;padding:10px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;'; bCan.onclick=closeUserModal; btnRow.appendChild(bCan);
  box.appendChild(btnRow); ov.appendChild(box); document.body.appendChild(ov);
}

function showResetPwdModal(id) {
  var name = (window._usersMap[id] || {}).name || 'Usuario';
  var ov = document.createElement('div');
  ov.id = 'userModal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;box-sizing:border-box;';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:400px;width:100%;box-sizing:border-box;';
  var h = document.createElement('h3'); h.style.marginTop='0'; h.textContent='Restablecer contraseña'; box.appendChild(h);
  var info = document.createElement('p'); info.style.cssText='font-size:14px;color:#555;margin-bottom:14px;'; info.innerHTML='Usuario: <strong>' + name + '</strong>'; box.appendChild(info);
  function field(lbl, id, ph) {
    var l = document.createElement('label'); l.style.cssText='display:block;font-size:13px;font-weight:600;margin-bottom:4px;'; l.textContent=lbl; box.appendChild(l);
    var inp = document.createElement('input'); inp.id=id; inp.type='password'; inp.placeholder=ph;
    inp.style.cssText='width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;margin-bottom:10px;'; box.appendChild(inp);
  }
  field('Nueva contraseña','rp_pwd','Mínimo 8 caracteres');
  field('Confirmar contraseña','rp_pwd2','Repite la contraseña');
  var errDiv = document.createElement('div'); errDiv.id='rp_err'; errDiv.style.cssText='color:#a01818;font-size:13px;margin-bottom:10px;display:none;'; box.appendChild(errDiv);
  var btnRow = document.createElement('div'); btnRow.style.cssText='display:flex;gap:8px;';
  var bOk = document.createElement('button'); bOk.type='button'; bOk.textContent='Restablecer'; bOk.style.cssText='flex:1;padding:10px;background:#16321f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;'; bOk.onclick=function(){ submitResetPwd(id); }; btnRow.appendChild(bOk);
  var bCan = document.createElement('button'); bCan.type='button'; bCan.textContent='Cancelar'; bCan.style.cssText='flex:1;padding:10px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;'; bCan.onclick=closeUserModal; btnRow.appendChild(bCan);
  box.appendChild(btnRow); ov.appendChild(box); document.body.appendChild(ov);
  document.getElementById('rp_pwd').focus();
}

function closeUserModal() { var el=document.getElementById('userModal'); if(el) el.remove(); }

async function submitCreateUser() {
  var err=document.getElementById('um_err'); err.style.display='none';
  var body={ name: document.getElementById('um_name').value.trim(), username: document.getElementById('um_user').value.trim().toLowerCase(), password: document.getElementById('um_pwd').value, role: document.getElementById('um_role').value };
  if (!body.name||!body.username||!body.password){ err.textContent='Completa todos los campos.'; err.style.display='block'; return; }
  var r=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  var data=await r.json();
  if(r.ok){ closeUserModal(); loadUsers(); } else { err.textContent=data.error||'Error al crear.'; err.style.display='block'; }
}

async function submitEditUser(id) {
  var err=document.getElementById('em_err'); err.style.display='none';
  var body={ name: document.getElementById('em_name').value.trim(), role: document.getElementById('em_role').value };
  var r=await fetch('/api/admin/users/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  var data=await r.json();
  if(r.ok){ closeUserModal(); loadUsers(); } else { err.textContent=data.error||'Error al guardar.'; err.style.display='block'; }
}

async function submitResetPwd(id) {
  var err=document.getElementById('rp_err'); err.style.display='none';
  var pwd=document.getElementById('rp_pwd').value, pwd2=document.getElementById('rp_pwd2').value;
  if(pwd!==pwd2){ err.textContent='Las contraseñas no coinciden.'; err.style.display='block'; return; }
  if(pwd.length<8){ err.textContent='Mínimo 8 caracteres.'; err.style.display='block'; return; }
  var r=await fetch('/api/admin/users/'+id+'/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd})});
  var data=await r.json();
  if(r.ok){ closeUserModal(); alert('✓ Contraseña restablecida. Las sesiones activas del usuario fueron cerradas.'); }
  else { err.textContent=data.error||'Error.'; err.style.display='block'; }
}

async function toggleUser(id, active) {
  var r=await fetch('/api/admin/users/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:active})});
  if(r.ok) loadUsers(); else { var d=await r.json(); alert(d.error||'Error'); }
}

async function deleteUser(id) {
  var name = (window._usersMap[id] || {}).name || 'este usuario';
  if(!confirm('¿Eliminar al usuario "'+name+'"? Esta acción no se puede deshacer.')) return;
  var r=await fetch('/api/admin/users/'+id,{method:'DELETE'});
  var d=await r.json();
  if(r.ok) loadUsers(); else alert(d.error||'Error al eliminar');
}

async function showEditCustomerModal(id) {
  const r = await fetch('/api/admin/customers/' + id + '/detail');
  const d = await r.json();
  if (!r.ok) { alert(d.error || 'Error'); return; }
  const c = d.customer;

  var ov = document.createElement('div');
  ov.id = 'editCustModal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;box-sizing:border-box;overflow-y:auto;';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:420px;width:100%;box-sizing:border-box;';

  function makeField(lbl, id, val, type) {
    type = type || 'text';
    var l = document.createElement('label');
    l.style.cssText = 'display:block;font-size:13px;font-weight:600;margin-top:12px;margin-bottom:4px;color:#333;';
    l.textContent = lbl;
    var inp = document.createElement('input');
    inp.id = id; inp.type = type; inp.value = val || '';
    inp.style.cssText = 'width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;';
    if (type === 'date') { inp.min = '1900-01-01'; inp.max = '2100-12-31'; }
    if (id === 'ec_first_name' || id === 'ec_last_name') inp.style.textTransform = 'uppercase';
    box.appendChild(l); box.appendChild(inp);
  }

  var h = document.createElement('h3'); h.style.marginTop = '0'; h.textContent = 'Editar cliente'; box.appendChild(h);
  makeField('RUT', 'ec_rut', c.rut);
  makeField('Nombre', 'ec_first_name', c.first_name);
  makeField('Apellido', 'ec_last_name', c.last_name);
  makeField('Correo', 'ec_email', c.email, 'email');
  makeField('Teléfono', 'ec_whatsapp', c.whatsapp_number);
  makeField('Fecha de nacimiento', 'ec_birth_date', c.birth_date, 'date');

  var errDiv = document.createElement('div');
  errDiv.id = 'ec_err';
  errDiv.style.cssText = 'color:#a01818;font-size:13px;margin-top:10px;display:none;';
  box.appendChild(errDiv);

  var btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;gap:8px;margin-top:18px;';
  var bOk = document.createElement('button'); bOk.type = 'button'; bOk.textContent = 'Guardar cambios';
  bOk.style.cssText = 'flex:1;padding:10px;background:#16321f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;';
  bOk.onclick = function() { submitEditCustomer(id); };
  var bCan = document.createElement('button'); bCan.type = 'button'; bCan.textContent = 'Cancelar';
  bCan.style.cssText = 'flex:1;padding:10px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;';
  bCan.onclick = function() { var el = document.getElementById('editCustModal'); if(el) el.remove(); };
  btnRow.appendChild(bOk); btnRow.appendChild(bCan);
  box.appendChild(btnRow);
  ov.appendChild(box);
  document.body.appendChild(ov);
}

async function submitEditCustomer(id) {
  var err = document.getElementById('ec_err'); err.style.display = 'none';
  var rutRaw = document.getElementById('ec_rut').value.trim();
  var rutDigits = rutRaw.replace(/[^0-9kK]/gi, '');
  var rut = rutDigits.length >= 2 ? rutDigits.slice(0,-1) + '-' + rutDigits.slice(-1).toUpperCase() : rutRaw;
  var birthDate = document.getElementById('ec_birth_date').value;
  if (birthDate) {
    var yr = parseInt(birthDate.split('-')[0], 10);
    if (yr < 1900 || yr > 2100) { err.textContent = 'Año de nacimiento inválido (1900-2100).'; err.style.display = 'block'; return; }
  }
  var body = {
    rut: rut,
    first_name: document.getElementById('ec_first_name').value.trim().toUpperCase(),
    last_name:  document.getElementById('ec_last_name').value.trim().toUpperCase(),
    email:      document.getElementById('ec_email').value.trim(),
    whatsapp_number: document.getElementById('ec_whatsapp').value.trim(),
    birth_date: birthDate
  };
  var r = await fetch('/api/admin/customers/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  var data = await r.json();
  if (r.ok) { var el = document.getElementById('editCustModal'); if(el) el.remove(); loadCustomers(); }
  else { err.textContent = data.error || 'Error al guardar.'; err.style.display = 'block'; }
}

function showAddCustomerModal() {
  var ov = document.createElement('div');
  ov.id = 'addCustOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;box-sizing:border-box;overflow-y:auto;';
  ov.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:100%;box-sizing:border-box;">' +
    '<h3 style="margin-top:0;">Agregar cliente</h3>' +
    '<form id="addCustForm" autocomplete="off">' +
      '<label style="display:block;font-size:13px;font-weight:600;margin-top:12px;margin-bottom:4px;">RUT</label>' +
      '<input id="ac_rut" type="text" placeholder="12345678-5" oninput="acFormatRut(this)" style="width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;">' +
      '<label style="display:block;font-size:13px;font-weight:600;margin-top:12px;margin-bottom:4px;">Nombre</label>' +
      '<input id="ac_fn" type="text" placeholder="Juan" style="width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;text-transform:uppercase;">' +
      '<label style="display:block;font-size:13px;font-weight:600;margin-top:12px;margin-bottom:4px;">Apellido</label>' +
      '<input id="ac_ln" type="text" placeholder="Pérez" style="width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;text-transform:uppercase;">' +
      '<label style="display:block;font-size:13px;font-weight:600;margin-top:12px;margin-bottom:4px;">Correo</label>' +
      '<input id="ac_email" type="email" placeholder="juan@correo.com" style="width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;">' +
      '<label style="display:block;font-size:13px;font-weight:600;margin-top:12px;margin-bottom:4px;">Teléfono</label>' +
      '<div style="display:flex;gap:8px;align-items:center;">' +
        '<span style="padding:9px 10px;border:1.5px solid #ddd;border-radius:7px;background:#f9f9f9;font-size:14px;white-space:nowrap;">+569</span>' +
        '<input id="ac_phone" type="tel" placeholder="12345678" maxlength="8" inputmode="numeric" style="flex:1;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;">' +
      '</div>' +
      '<label style="display:block;font-size:13px;font-weight:600;margin-top:12px;margin-bottom:4px;">Fecha de nacimiento</label>' +
      '<input id="ac_bd" type="date" style="width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;">' +
      '<div id="ac_err" style="color:#a01818;font-size:13px;margin-top:10px;display:none;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:18px;">' +
        '<button type="button" onclick="submitAddCustomer()" style="flex:1;padding:10px;background:#16321f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;">Guardar cliente</button>' +
        '<button type="button" onclick="closeAddCustomerModal()" style="flex:1;padding:10px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Cancelar</button>' +
      '</div>' +
    '</form>' +
  '</div>';
  document.body.appendChild(ov);
  document.getElementById('ac_rut').focus();
}

function acFormatRut(inp) {
  let v = inp.value.replace(/[^0-9kK]/g, '').toUpperCase();
  inp.value = v.length < 2 ? v : v.slice(0,-1) + '-' + v.slice(-1);
}

function closeAddCustomerModal() {
  const el = document.getElementById('addCustOverlay');
  if (el) el.remove();
}

async function submitAddCustomer() {
  const err = document.getElementById('ac_err');
  err.style.display = 'none';
  const rutRaw = document.getElementById('ac_rut').value.trim();
  const rutDigits = rutRaw.replace(/[^0-9kK]/gi, '');
  const rut = rutDigits.length >= 2 ? rutDigits.slice(0,-1) + '-' + rutDigits.slice(-1).toUpperCase() : rutRaw;
  const fn = document.getElementById('ac_fn').value.trim();
  const ln = document.getElementById('ac_ln').value.trim();
  const email = document.getElementById('ac_email').value.trim();
  const phone = document.getElementById('ac_phone').value.trim();
  const bd = document.getElementById('ac_bd').value;
  if (!rut || !fn || !ln || !email || !bd) { err.textContent = 'Completa todos los campos obligatorios.'; err.style.display = 'block'; return; }
  const r = await fetch('/api/customers', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rut, first_name: fn, last_name: ln, birth_date: bd, email, whatsapp_number: phone ? '+569' + phone : undefined, marcas: 0 })
  });
  const data = await r.json();
  if (r.ok) { closeAddCustomerModal(); loadCustomers(); }
  else { err.textContent = data.error || 'Error al agregar.'; err.style.display = 'block'; }
}
</script>
</body></html>`;
}

module.exports = { render };
