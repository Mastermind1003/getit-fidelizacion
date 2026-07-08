const http = require('http');
const crypto = require('crypto');
const url = require('url');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Valida RUT chileno en formato "12345678-9" (sin puntos, con guión)
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



const DB_FILE_PATH = path.join(__dirname, 'loyalty.db');
const db = new DatabaseSync(DB_FILE_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER REFERENCES branches(id),
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT CHECK(role IN ('cashier','manager','admin','superadmin')) NOT NULL DEFAULT 'cashier',
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rut TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  email TEXT UNIQUE,
  whatsapp_number TEXT UNIQUE,
  signed_up_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  required_stamps INTEGER NOT NULL DEFAULT 10,
  rules_json TEXT DEFAULT '{}',
  logo_url TEXT,
  logo_width INTEGER DEFAULT 200,
  primary_color TEXT DEFAULT '#16321f',
  secondary_color TEXT DEFAULT '#0f1115',
  stamp_icon TEXT DEFAULT '★',
  stamp_color TEXT DEFAULT '#d62828',
  stamp_size INTEGER DEFAULT 22,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  program_id INTEGER NOT NULL REFERENCES loyalty_programs(id),
  unique_token TEXT UNIQUE NOT NULL,
  short_code TEXT UNIQUE,
  current_stamps INTEGER DEFAULT 0,
  status TEXT CHECK(status IN ('active','completed','expired')) DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  receipt_number TEXT NOT NULL,
  purchase_date TEXT DEFAULT CURRENT_TIMESTAMP,
  amount REAL NOT NULL,
  category TEXT,
  created_by_staff_id INTEGER REFERENCES staff_users(id),
  UNIQUE(branch_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS stamp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loyalty_card_id INTEGER NOT NULL REFERENCES loyalty_cards(id),
  purchase_id INTEGER REFERENCES purchases(id),
  staff_id INTEGER REFERENCES staff_users(id),
  branch_id INTEGER REFERENCES branches(id),
  type TEXT CHECK(type IN ('grant','revoke')) NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_per_purchase
  ON stamp_events(purchase_id)
  WHERE type = 'grant';

CREATE TABLE IF NOT EXISTS rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES loyalty_programs(id),
  name TEXT NOT NULL,
  description TEXT,
  stamps_required INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loyalty_card_id INTEGER NOT NULL REFERENCES loyalty_cards(id),
  reward_id INTEGER REFERENCES rewards(id),
  staff_id INTEGER REFERENCES staff_users(id),
  branch_id INTEGER REFERENCES branches(id),
  redeemed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  status TEXT CHECK(status IN ('redeemed','cancelled')) DEFAULT 'redeemed'
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_staff_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id),
  channel TEXT DEFAULT 'whatsapp',
  message_type TEXT,
  content TEXT,
  sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'sent'
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff_users(id),
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rut TEXT,
  documento TEXT,
  fecha TEXT,
  hora TEXT,
  cajero TEXT,
  producto TEXT,
  grupo TEXT,
  cantidad REAL,
  total_neto REAL,
  total_bruto REAL,
  import_batch TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS loyalty_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rut TEXT,
  nombre TEXT,
  fecha_nac TEXT,
  correo TEXT,
  boleta TEXT,
  stickers INTEGER,
  dia INTEGER,
  mes INTEGER,
  cajero TEXT,
  import_batch TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_registry_boleta ON loyalty_registry(boleta);
CREATE INDEX IF NOT EXISTS idx_registry_rut ON loyalty_registry(rut);
`);

// Migración: agrega columnas nuevas a bases de datos creadas con versiones anteriores
try { db.exec('ALTER TABLE loyalty_programs ADD COLUMN logo_width INTEGER DEFAULT 200'); } catch (e) { /* ya existe */ }
try { db.exec("ALTER TABLE loyalty_programs ADD COLUMN stamp_color TEXT DEFAULT '#d62828'"); } catch (e) { /* ya existe */ }
try { db.exec('ALTER TABLE loyalty_programs ADD COLUMN stamp_size INTEGER DEFAULT 22'); } catch (e) { /* ya existe */ }
try { db.exec('ALTER TABLE staff_users ADD COLUMN username TEXT'); } catch (e) { /* ya existe */ }
try { db.exec('ALTER TABLE customers ADD COLUMN signed_up_by TEXT'); } catch (e) { /* ya existe */ }
try { db.exec('ALTER TABLE loyalty_cards ADD COLUMN short_code TEXT'); } catch (e) { /* ya existe */ }
try {
  db.exec(`CREATE TABLE IF NOT EXISTS sales_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT, documento TEXT, fecha TEXT, hora TEXT, cajero TEXT,
    producto TEXT, grupo TEXT, cantidad REAL, total_neto REAL, total_bruto REAL,
    import_batch TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_rut ON sales_detail(rut)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_doc ON sales_detail(documento)');
  db.exec(`CREATE TABLE IF NOT EXISTS loyalty_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT, nombre TEXT, fecha_nac TEXT, correo TEXT, boleta TEXT,
    stickers INTEGER, dia INTEGER, mes INTEGER, cajero TEXT,
    import_batch TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_registry_boleta ON loyalty_registry(boleta)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_registry_rut ON loyalty_registry(rut)');
} catch (e) { /* ya existe */ }

// ── Tablas de configuración editable ─────────────────────────
// registro_config
db.exec(`CREATE TABLE IF NOT EXISTS registro_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  logo_url TEXT DEFAULT 'https://i.imgur.com/nJrUCee.png',
  logo_width INTEGER DEFAULT 140,
  titulo TEXT DEFAULT 'Club de Fidelización',
  subtitulo TEXT DEFAULT 'Regístrate y acumula marcas con tus compras',
  bg_color TEXT DEFAULT '#f4f4f5',
  btn_color TEXT DEFAULT '#16321f',
  btn_texto TEXT DEFAULT 'Crear mi tarjeta',
  campo_rut INTEGER DEFAULT 1,
  campo_nombre INTEGER DEFAULT 1,
  campo_apellido INTEGER DEFAULT 1,
  campo_correo INTEGER DEFAULT 1,
  campo_telefono INTEGER DEFAULT 1,
  campo_nacimiento INTEGER DEFAULT 1,
  chk1_texto TEXT DEFAULT 'He leído y acepto los Términos y Condiciones del Club de Fidelización Get it.',
  chk2_texto TEXT DEFAULT 'Autorizo a Get it a usar mis datos personales para gestionar mi membresía y enviarme comunicaciones sobre ofertas, promociones y beneficios del club.',
  tyc_texto TEXT DEFAULT ''
)`);
try { db.exec("ALTER TABLE registro_config ADD COLUMN logo_width INTEGER DEFAULT 140"); } catch(e) {}
try { db.exec("ALTER TABLE registro_config ADD COLUMN bg_color TEXT DEFAULT '#f4f4f5'"); } catch(e) {}
try { db.exec("ALTER TABLE registro_config ADD COLUMN campo_rut INTEGER DEFAULT 1"); } catch(e) {}
try { db.exec("ALTER TABLE registro_config ADD COLUMN campo_nombre INTEGER DEFAULT 1"); } catch(e) {}
try { db.exec("ALTER TABLE registro_config ADD COLUMN campo_apellido INTEGER DEFAULT 1"); } catch(e) {}
try {
  const existsRC = db.prepare('SELECT id FROM registro_config WHERE id = 1').get();
  if (!existsRC) {
    db.prepare(`INSERT INTO registro_config (id, logo_url, logo_width, titulo, subtitulo, bg_color, btn_color, btn_texto, campo_rut, campo_nombre, campo_apellido, campo_correo, campo_telefono, campo_nacimiento, chk1_texto, chk2_texto) VALUES (1,'https://i.imgur.com/nJrUCee.png',140,'Club de Fidelización','Regístrate y acumula marcas con tus compras','#f4f4f5','#16321f','Crear mi tarjeta',1,1,1,1,1,1,'He leído y acepto los Términos y Condiciones del Club de Fidelización Get it.','Autorizo a Get it a usar mis datos personales para gestionar mi membresía y enviarme comunicaciones sobre ofertas, promociones y beneficios del club.')`).run();
  } else {
    db.prepare("UPDATE registro_config SET logo_url=COALESCE(logo_url,'https://i.imgur.com/nJrUCee.png'), titulo=COALESCE(titulo,'Club de Fidelización'), subtitulo=COALESCE(subtitulo,'Regístrate y acumula marcas con tus compras'), bg_color=COALESCE(bg_color,'#f4f4f5'), btn_color=COALESCE(btn_color,'#16321f'), btn_texto=COALESCE(btn_texto,'Crear mi tarjeta') WHERE id=1").run();
  }
} catch(e) { console.error('registro_config init error:', e.message); }

// login_config
db.exec(`CREATE TABLE IF NOT EXISTS login_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  logo_url TEXT DEFAULT 'https://i.imgur.com/nJrUCee.png',
  logo_width INTEGER DEFAULT 120,
  bg_color TEXT DEFAULT '#f4f4f5',
  btn_color TEXT DEFAULT '#16321f',
  btn_texto TEXT DEFAULT 'Ingresar'
)`);
try { db.exec("ALTER TABLE login_config ADD COLUMN logo_width INTEGER DEFAULT 120"); } catch(e) {}
try {
  const existsLC = db.prepare('SELECT id FROM login_config WHERE id = 1').get();
  if (!existsLC) {
    db.prepare("INSERT INTO login_config (id, logo_url, logo_width, bg_color, btn_color, btn_texto) VALUES (1,'https://i.imgur.com/nJrUCee.png',120,'#f4f4f5','#16321f','Ingresar')").run();
  } else {
    db.prepare("UPDATE login_config SET logo_url=COALESCE(logo_url,'https://i.imgur.com/nJrUCee.png'), logo_width=COALESCE(logo_width,120), bg_color=COALESCE(bg_color,'#f4f4f5'), btn_color=COALESCE(btn_color,'#16321f'), btn_texto=COALESCE(btn_texto,'Ingresar') WHERE id=1").run();
  }
} catch(e) { console.error('login_config init error:', e.message); }

// tyc_config
db.exec(`CREATE TABLE IF NOT EXISTS tyc_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  logo_url TEXT DEFAULT 'https://i.imgur.com/nJrUCee.png',
  logo_width INTEGER DEFAULT 120,
  bg_color TEXT DEFAULT '#f4f4f5',
  card_color TEXT DEFAULT '#ffffff',
  title_color TEXT DEFAULT '#16321f',
  h2_color TEXT DEFAULT '#16321f',
  text_color TEXT DEFAULT '#333333',
  razon_social TEXT DEFAULT 'Convenience de Chile SPA',
  rut TEXT DEFAULT '76.865.177-9',
  nombre_fantasia TEXT DEFAULT 'Get it',
  domicilio TEXT DEFAULT 'Santiago, Región Metropolitana, Chile',
  titulo TEXT DEFAULT 'Términos y Condiciones del Club de Fidelización',
  fecha_actualizacion TEXT DEFAULT '08 de julio de 2026',
  s1_titulo TEXT DEFAULT '1. Aceptación de los términos',
  s1_texto TEXT DEFAULT 'Al registrarte en el Club de Fidelización Get it, declaras haber leído, comprendido y aceptado los presentes Términos y Condiciones. Si no estás de acuerdo con alguno de ellos, no debes completar el registro.',
  s2_titulo TEXT DEFAULT '2. El programa de fidelización',
  s2_texto TEXT DEFAULT 'El Club de Fidelización Get it es un programa administrado por Convenience de Chile SPA que permite a sus miembros acumular marcas por cada visita o compra realizada en los establecimientos participantes de la marca Get it.',
  s3_titulo TEXT DEFAULT '3. Registro y membresía',
  s3_texto TEXT DEFAULT 'Para participar en el programa, el cliente debe registrarse proporcionando datos verídicos y actualizados. Cada persona puede tener una sola cuenta asociada a su RUT. El registro es personal e intransferible.',
  s4_titulo TEXT DEFAULT '4. Tratamiento de datos personales',
  s4_texto TEXT DEFAULT 'De conformidad con la Ley N° 19.628 sobre Protección de la Vida Privada, Convenience de Chile SPA trata los datos personales exclusivamente para gestionar la membresía, acreditar marcas y canjes, y enviar comunicaciones sobre beneficios del Club. No compartirá estos datos a terceros sin consentimiento expreso del titular, salvo requerimiento legal.',
  s5_titulo TEXT DEFAULT '5. Derechos del titular de datos',
  s5_texto TEXT DEFAULT 'Conforme a la Ley N° 19.628, el cliente tiene derecho a acceder, rectificar y solicitar la eliminación de sus datos personales, así como revocar el consentimiento para comunicaciones comerciales. Para ejercer estos derechos, puede contactar directamente a un establecimiento Get it.',
  s6_titulo TEXT DEFAULT '6. Seguridad de la información',
  s6_texto TEXT DEFAULT 'Convenience de Chile SPA adopta medidas técnicas y organizativas razonables para proteger los datos personales de sus miembros contra accesos no autorizados, pérdida o alteración.',
  s7_titulo TEXT DEFAULT '7. Modificaciones',
  s7_texto TEXT DEFAULT 'Convenience de Chile SPA se reserva el derecho de actualizar estos Términos y Condiciones. Las modificaciones serán informadas a través de los canales del programa y entrarán en vigencia desde su publicación. El uso continuado del programa implica la aceptación de los términos actualizados.',
  s8_titulo TEXT DEFAULT '8. Legislación aplicable',
  s8_texto TEXT DEFAULT 'Estos Términos y Condiciones se rigen por las leyes de la República de Chile. Cualquier controversia derivada del presente programa será sometida a los tribunales ordinarios de justicia de Santiago.'
)`);
try {
  const existsTyc = db.prepare('SELECT id FROM tyc_config WHERE id = 1').get();
  if (!existsTyc) {
    db.prepare("INSERT INTO tyc_config (id) VALUES (1)").run();
  }
  // Rellenar NULLs con defaults (para filas existentes)
  db.prepare("UPDATE tyc_config SET logo_url=COALESCE(logo_url,'https://i.imgur.com/nJrUCee.png'), logo_width=COALESCE(logo_width,120), bg_color=COALESCE(bg_color,'#f4f4f5'), card_color=COALESCE(card_color,'#ffffff'), title_color=COALESCE(title_color,'#16321f'), h2_color=COALESCE(h2_color,'#16321f'), text_color=COALESCE(text_color,'#333333'), razon_social=COALESCE(razon_social,'Convenience de Chile SPA'), rut=COALESCE(rut,'76.865.177-9'), nombre_fantasia=COALESCE(nombre_fantasia,'Get it'), domicilio=COALESCE(domicilio,'Santiago, Región Metropolitana, Chile'), titulo=COALESCE(titulo,'Términos y Condiciones del Club de Fidelización'), fecha_actualizacion=COALESCE(fecha_actualizacion,'08 de julio de 2026'), s1_titulo=COALESCE(s1_titulo,'1. Aceptación de los términos'), s1_texto=COALESCE(s1_texto,'Al registrarte en el Club de Fidelización Get it, declaras haber leído, comprendido y aceptado los presentes Términos y Condiciones.'), s2_titulo=COALESCE(s2_titulo,'2. El programa de fidelización'), s2_texto=COALESCE(s2_texto,'El Club de Fidelización Get it es un programa administrado por Convenience de Chile SPA.'), s3_titulo=COALESCE(s3_titulo,'3. Registro y membresía'), s3_texto=COALESCE(s3_texto,'Para participar, el cliente debe registrarse con datos verídicos. El registro es personal e intransferible.'), s4_titulo=COALESCE(s4_titulo,'4. Tratamiento de datos personales'), s4_texto=COALESCE(s4_texto,'De conformidad con la Ley N° 19.628, Convenience de Chile SPA trata los datos personales exclusivamente para gestionar la membresía y enviar comunicaciones sobre beneficios del Club.'), s5_titulo=COALESCE(s5_titulo,'5. Derechos del titular'), s5_texto=COALESCE(s5_texto,'El cliente tiene derecho a acceder, rectificar y eliminar sus datos, y revocar el consentimiento para comunicaciones comerciales.'), s6_titulo=COALESCE(s6_titulo,'6. Seguridad'), s6_texto=COALESCE(s6_texto,'Convenience de Chile SPA adopta medidas razonables para proteger los datos personales.'), s7_titulo=COALESCE(s7_titulo,'7. Modificaciones'), s7_texto=COALESCE(s7_texto,'Convenience de Chile SPA se reserva el derecho de actualizar estos Términos con aviso previo.'), s8_titulo=COALESCE(s8_titulo,'8. Legislación aplicable'), s8_texto=COALESCE(s8_texto,'Estos Términos se rigen por las leyes de Chile. Las controversias se someterán a los tribunales de Santiago.') WHERE id=1").run();
} catch(e) { console.error('tyc_config init error:', e.message); }


// Migración de datos: rellenar NULLs con defaults en filas ya existentes
try {
  db.prepare("UPDATE login_config SET logo_url=COALESCE(logo_url,'https://i.imgur.com/nJrUCee.png'), logo_width=COALESCE(logo_width,120), bg_color=COALESCE(bg_color,'#f4f4f5'), btn_color=COALESCE(btn_color,'#16321f'), btn_texto=COALESCE(btn_texto,'Ingresar') WHERE id=1").run();
} catch(e) {}
try {
  db.prepare("UPDATE tyc_config SET logo_url=COALESCE(logo_url,'https://i.imgur.com/nJrUCee.png'), logo_width=COALESCE(logo_width,120), bg_color=COALESCE(bg_color,'#f4f4f5'), card_color=COALESCE(card_color,'#ffffff'), title_color=COALESCE(title_color,'#16321f'), h2_color=COALESCE(h2_color,'#16321f'), text_color=COALESCE(text_color,'#333333'), razon_social=COALESCE(razon_social,'Convenience de Chile SPA'), rut=COALESCE(rut,'76.865.177-9'), nombre_fantasia=COALESCE(nombre_fantasia,'Get it'), domicilio=COALESCE(domicilio,'Santiago, Región Metropolitana, Chile'), titulo=COALESCE(titulo,'Términos y Condiciones del Club de Fidelización'), fecha_actualizacion=COALESCE(fecha_actualizacion,'08 de julio de 2026'), s1_titulo=COALESCE(s1_titulo,'1. Aceptación de los términos'), s1_texto=COALESCE(s1_texto,'Al registrarte en el Club de Fidelización Get it, declaras haber leído, comprendido y aceptado los presentes Términos y Condiciones.'), s2_titulo=COALESCE(s2_titulo,'2. El programa de fidelización'), s2_texto=COALESCE(s2_texto,'El Club de Fidelización Get it es un programa administrado por Convenience de Chile SPA.'), s3_titulo=COALESCE(s3_titulo,'3. Registro y membresía'), s3_texto=COALESCE(s3_texto,'El cliente debe registrarse proporcionando datos verídicos. El registro es personal e intransferible.'), s4_titulo=COALESCE(s4_titulo,'4. Tratamiento de datos personales'), s4_texto=COALESCE(s4_texto,'De conformidad con la Ley N° 19.628, Convenience de Chile SPA trata los datos personales exclusivamente para gestionar la membresía y enviar comunicaciones sobre beneficios del Club.'), s5_titulo=COALESCE(s5_titulo,'5. Derechos del titular'), s5_texto=COALESCE(s5_texto,'El cliente tiene derecho a acceder, rectificar y eliminar sus datos, y revocar el consentimiento para comunicaciones comerciales.'), s6_titulo=COALESCE(s6_titulo,'6. Seguridad'), s6_texto=COALESCE(s6_texto,'Convenience de Chile SPA adopta medidas razonables para proteger los datos personales.'), s7_titulo=COALESCE(s7_titulo,'7. Modificaciones'), s7_texto=COALESCE(s7_texto,'Convenience de Chile SPA se reserva el derecho de actualizar estos Términos y Condiciones con aviso previo.'), s8_titulo=COALESCE(s8_titulo,'8. Legislación aplicable'), s8_texto=COALESCE(s8_texto,'Estos Términos se rigen por las leyes de Chile. Las controversias se someterán a los tribunales de Santiago.') WHERE id=1").run();
} catch(e) {}

function genShortCode() {
  const digits = '0123456789';
  let part = (len) => Array.from({ length: len }, () => digits[Math.floor(Math.random() * digits.length)]).join('');
  return `${part(4)}-${part(2)}`;
}
// Asigna short_code a tarjetas creadas antes de esta versión que no lo tengan,
// y regenera los códigos antiguos que tenían letras (ahora deben ser solo numéricos)
const cardsWithoutCode = db.prepare("SELECT id FROM loyalty_cards WHERE short_code IS NULL OR short_code GLOB '*[A-Z]*'").all();
for (const c of cardsWithoutCode) {
  let code, exists;
  do { code = genShortCode(); exists = db.prepare('SELECT 1 FROM loyalty_cards WHERE short_code = ?').get(code); } while (exists);
  db.prepare('UPDATE loyalty_cards SET short_code = ? WHERE id = ?').run(code, c.id);
}

const branchCount = db.prepare('SELECT COUNT(*) c FROM branches').get().c;
if (branchCount === 0) {
  db.prepare('INSERT INTO branches (name, address) VALUES (?, ?)').run('Sucursal Centro', 'Av. Principal 123');
  db.prepare(`INSERT INTO loyalty_programs (name, required_stamps, rules_json, logo_url, logo_width, primary_color, secondary_color, stamp_icon, stamp_color, stamp_size)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('Club Fidelidad', 10, JSON.stringify({ min_amount: 0 }),
         'https://i.imgur.com/nJrUCee.png', 140,
         '#000000', '#0f1115', '★', '#d62828', 22);
  db.prepare('INSERT INTO rewards (program_id, name, description, stamps_required) VALUES (?,?,?,?)')
    .run(1, 'Producto gratis', 'Premio al completar 10 marcas', 10);
}

// Crea los usuarios de acceso si todavía no existen (no depende de si hay sucursales o no,
// así una base de datos ya existente igual recibe los usuarios nuevos al actualizar el sistema)
function ensureStaffUser(username, password, name, role) {
  try {
    const exists = db.prepare('SELECT 1 FROM staff_users WHERE username = ?').get(username);
    if (exists) { console.log(`Usuario "${username}" ya existe, no se recrea.`); return; }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const placeholderEmail = `${username}@local.app`; // compatibilidad con bases de datos antiguas donde email era obligatorio
    db.prepare('INSERT INTO staff_users (branch_id, name, username, email, password_hash, role) VALUES (?,?,?,?,?,?)')
      .run(1, name, username, placeholderEmail, `${salt}:${hash}`, role);
    console.log(`Usuario "${username}" creado correctamente (rol: ${role}).`);
  } catch (err) {
    console.error(`No se pudo crear el usuario "${username}":`, err.message);
  }
}
// Migración: ampliar CHECK de roles para incluir superadmin
try { db.exec("UPDATE staff_users SET role = role WHERE role IN ('cashier','manager','admin','superadmin')"); } catch(e) {}

ensureStaffUser('MasterMind', '12345678', 'MasterMind', 'superadmin');
ensureStaffUser('adm2026', '12345678', 'Administrador', 'admin');
ensureStaffUser('tienda_1', '1234', 'Cajero Tienda 1', 'cashier');


const fs = require('fs');

// QRCode es opcional: en producción (servidor con internet) se instala con
// `npm install qrcode` y se usa para generar el QR real escaneable.
// Aquí se intenta cargar; si no está disponible, se usa un respaldo de texto.
let QRCode = null;
try { QRCode = require('qrcode'); } catch (e) { /* no disponible en este entorno de prueba */ }

let XLSX = null;
try { XLSX = require('xlsx'); } catch (e) { /* se instala en el servidor real con: npm install xlsx */ }

const PORT = process.env.PORT || 3000;

function getLanIp() {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
const LAN_IP = getLanIp();
const IS_PRODUCTION = !!(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const BASE_URL = process.env.RENDER_EXTERNAL_URL
  || process.env.APP_URL
  || `http://${LAN_IP}:${PORT}`;
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas

// ---------- Autenticación ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function getAuthenticatedStaff(req) {
  const cookies = parseCookies(req);
  const token = cookies.session_token;
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session || session.expires_at < Date.now()) return null;
  return db.prepare('SELECT id, name, email, role, branch_id FROM staff_users WHERE id = ? AND active = 1').get(session.staff_id);
}

async function loginStaff(req, res) {
  const body = await readBody(req);
  const { username, password } = body;
  if (!username || !password) return sendJSON(res, 400, { error: 'Usuario y contraseña son obligatorios.' });

  const staff = db.prepare('SELECT * FROM staff_users WHERE username = ? AND active = 1').get(username.trim());
  if (!staff || !verifyPassword(password, staff.password_hash)) {
    return sendJSON(res, 401, { error: 'Usuario o contraseña incorrectos.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  db.prepare('INSERT INTO sessions (token, staff_id, expires_at) VALUES (?,?,?)').run(token, staff.id, expiresAt);

  res.setHeader('Set-Cookie', `session_token=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}; SameSite=Lax`);
  sendJSON(res, 200, { ok: true, staff: { id: staff.id, name: staff.name, role: staff.role } });
}

function logoutStaff(req, res) {
  const cookies = parseCookies(req);
  if (cookies.session_token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(cookies.session_token);
  }
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0');
  sendJSON(res, 200, { ok: true });
}


function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function logAudit(actorStaffId, action, entity, entityId, before, after) {
  db.prepare(`INSERT INTO audit_logs (actor_staff_id, action, entity, entity_id, before_json, after_json)
              VALUES (?,?,?,?,?,?)`)
    .run(actorStaffId || null, action, entity, entityId, JSON.stringify(before || null), JSON.stringify(after || null));
}

function getCardFull(token) {
  return db.prepare(`
    SELECT lc.*, c.first_name, c.last_name, c.email, c.whatsapp_number, c.rut,
           lp.name as program_name, lp.required_stamps, lp.logo_url, lp.logo_width, lp.primary_color, lp.secondary_color, lp.stamp_icon, lp.stamp_color, lp.stamp_size
    FROM loyalty_cards lc
    JOIN customers c ON c.id = lc.customer_id
    JOIN loyalty_programs lp ON lp.id = lc.program_id
    WHERE lc.unique_token = ?
  `).get(token);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
  });
}

// ---------- Handlers ----------

function generateUniqueShortCode() {
  const digits = '0123456789';
  const part = (len) => Array.from({ length: len }, () => digits[Math.floor(Math.random() * digits.length)]).join('');
  let code, exists;
  do {
    code = `${part(4)}-${part(2)}`;
    exists = db.prepare('SELECT 1 FROM loyalty_cards WHERE short_code = ?').get(code);
  } while (exists);
  return code;
}

async function createCustomer(req, res) {
  const body = await readBody(req);
  const { rut, first_name, last_name, birth_date, email, whatsapp_number, program_id, boleta, marcas } = body;

  if (!rut || !first_name || !birth_date) {
    return sendJSON(res, 400, { error: 'Faltan campos obligatorios: rut, first_name, birth_date' });
  }
  // Validar año de nacimiento
  if (birth_date) {
    const yr = parseInt(birth_date.split('-')[0], 10);
    if (isNaN(yr) || yr < 1900 || yr > 2100) {
      return sendJSON(res, 400, { error: 'Fecha de nacimiento inválida. El año debe estar entre 1900 y 2100.' });
    }
  }

  const cleanRut = rut.trim().replace(/\./g, '').toUpperCase();
  if (!cleanRut.startsWith('TEMP-') && !isValidRut(cleanRut)) {
    return sendJSON(res, 400, { error: 'RUT inválido. Formato esperado: 12345678-9 (sin puntos, con guión).' });
  }

  // Email autogenerado si no se proporciona (compatibilidad con importaciones masivas)
  const cleanEmail = email || (cleanRut.replace(/[^0-9kK]/g, '').toLowerCase() + '@getit.cl');
  const numMarcas = Math.min(parseInt(marcas, 10) || 1, 10);

  try {
    const result = db.prepare(`
      INSERT INTO customers (rut, first_name, last_name, birth_date, email, whatsapp_number)
      VALUES (?,?,?,?,?,?)
    `).run(cleanRut, first_name.toUpperCase(), (last_name || '-').toUpperCase(), birth_date, cleanEmail, whatsapp_number || null);

    const customerId = Number(result.lastInsertRowid);
    const programId = program_id || 1;
    const token = crypto.randomUUID();
    const shortCode = generateUniqueShortCode();

    const cardResult = db.prepare(`
      INSERT INTO loyalty_cards (customer_id, program_id, unique_token, short_code, current_stamps, status)
      VALUES (?,?,?,?,0,'active')
    `).run(customerId, programId, token, shortCode);

    const cardId = Number(cardResult.lastInsertRowid);

    logAudit(null, 'create', 'customer', customerId, null, { first_name, last_name, boleta, marcas: numMarcas });

    const link = `/tarjeta/${token}`;
    db.prepare(`INSERT INTO notifications_log (customer_id, channel, message_type, content)
                VALUES (?,?,?,?)`).run(customerId, 'whatsapp', 'alta', `Tu tarjeta: ${link}`);

    sendJSON(res, 201, {
      customer_id: customerId,
      card_token: token,
      wallet_link: link,
      message: 'Cliente registrado con ' + numMarcas + ' marca(s).'
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return sendJSON(res, 409, { error: 'RUT ya registrado. Búscalo en caja para agregar marcas.' });
    }
    sendJSON(res, 500, { error: err.message });
  }
}

function searchCustomerByShortCode(req, res, code) {
  const staff = getAuthenticatedStaff(req);
  if (!staff) return sendJSON(res, 401, { error: 'Debes iniciar sesión como cajero.' });

  const cleanCode = decodeURIComponent(code).trim().toUpperCase();
  const card = db.prepare(`
    SELECT lc.*, lp.name as program_name, lp.required_stamps
    FROM loyalty_cards lc JOIN loyalty_programs lp ON lp.id = lc.program_id
    WHERE lc.short_code = ?
  `).get(cleanCode);
  if (!card) return sendJSON(res, 404, { error: 'No se encontró ninguna tarjeta con ese código.' });

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(card.customer_id);

  sendJSON(res, 200, {
    customer: { id: customer.id, rut: customer.rut, first_name: customer.first_name, last_name: customer.last_name },
    card
  });
}

function lookupBoleta(req, res, documento) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  const clean = decodeURIComponent(documento).trim();
  const rows = db.prepare(`
    SELECT producto, cantidad, total_bruto, fecha, hora, cajero
    FROM sales_detail WHERE documento = ?
  `).all(clean);
  const alreadyUsed = db.prepare('SELECT id FROM purchases WHERE receipt_number = ?').get(clean);
  sendJSON(res, 200, { rows, alreadyUsed: !!alreadyUsed, total: rows.reduce((s, r) => s + (r.total_bruto || 0), 0) });
}

function requireAdmin(req, res) {
  const staff = getAuthenticatedStaff(req);
  if (!staff || !['admin','superadmin'].includes(staff.role)) {
    sendJSON(res, 401, { error: 'Debes iniciar sesión como administrador.' });
    return null;
  }
  return staff;
}

function requireSuperAdmin(req, res) {
  const staff = getAuthenticatedStaff(req);
  if (!staff || staff.role !== 'superadmin') {
    sendJSON(res, 403, { error: 'Acceso restringido al administrador principal.' });
    return null;
  }
  return staff;
}

function getCustomerDetail(req, res, id) {
  const staff = requireAdmin(req, res);
  if (!staff) return;

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return sendJSON(res, 404, { error: 'Cliente no encontrado.' });

  const purchases = db.prepare(`
    SELECT p.id, p.receipt_number as documento, p.purchase_date,
           COALESCE(SUM(sd.total_bruto), 0) as monto,
           MIN(sd.fecha) as fecha, MIN(sd.hora) as hora
    FROM purchases p
    LEFT JOIN sales_detail sd ON sd.documento = p.receipt_number
    WHERE p.customer_id = ?
    GROUP BY p.id
    ORDER BY p.id DESC
  `).all(id);

  const topProducts = db.prepare(`
    SELECT sd.producto, SUM(sd.cantidad) as cantidad, SUM(sd.total_bruto) as monto
    FROM sales_detail sd
    WHERE sd.documento IN (SELECT receipt_number FROM purchases WHERE customer_id = ?) AND sd.producto IS NOT NULL
    GROUP BY sd.producto ORDER BY cantidad DESC LIMIT 10
  `).all(id);

  const hourPattern = db.prepare(`
    SELECT CAST(SUBSTR(sd.hora,1,2) AS INTEGER) as hora_del_dia, COUNT(*) as veces
    FROM sales_detail sd
    WHERE sd.documento IN (SELECT receipt_number FROM purchases WHERE customer_id = ?) AND sd.hora IS NOT NULL
    GROUP BY hora_del_dia ORDER BY veces DESC
  `).all(id);

  const dayPattern = db.prepare(`
    SELECT CAST(strftime('%w', sd.fecha) AS INTEGER) as dow, COUNT(*) as veces
    FROM sales_detail sd
    WHERE sd.documento IN (SELECT receipt_number FROM purchases WHERE customer_id = ?) AND sd.fecha IS NOT NULL
    GROUP BY dow ORDER BY veces DESC
  `).all(id);

  sendJSON(res, 200, { customer, purchases, topProducts, hourPattern, dayPattern });
}

function downloadDatabase(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  try {
    const fileData = fs.readFileSync(DB_FILE_PATH);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="loyalty-backup-' + new Date().toISOString().slice(0,10) + '.db"'
    });
    res.end(fileData);
  } catch (err) {
    sendJSON(res, 500, { error: 'No se pudo leer el archivo de base de datos: ' + err.message });
  }
}

function listCustomersAdmin(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  const rows = db.prepare(`
    SELECT c.id, c.rut, c.first_name, c.last_name, c.birth_date, c.email,
           lc.current_stamps, lp.required_stamps, lc.status, lc.unique_token, lc.short_code,
           (SELECT COUNT(*) FROM purchases p WHERE p.customer_id = c.id) as total_boletas,
           (SELECT COUNT(*) FROM reward_redemptions rr JOIN loyalty_cards lc2 ON lc2.id = rr.loyalty_card_id WHERE lc2.customer_id = c.id) as premios
    FROM customers c
    LEFT JOIN loyalty_cards lc ON lc.customer_id = c.id
    LEFT JOIN loyalty_programs lp ON lp.id = lc.program_id
    ORDER BY c.id DESC
  `).all();
  sendJSON(res, 200, rows);
}

async function updateCustomerAdmin(req, res, id) {
  const staff = requireAdmin(req, res);
  if (!staff) return;

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return sendJSON(res, 404, { error: 'Cliente no encontrado.' });

  const body = await readBody(req);
  const { rut, first_name, last_name, birth_date, email, whatsapp_number } = body;

  let cleanRut = customer.rut;
  if (rut) {
    cleanRut = rut.trim().toUpperCase();
    if (!isValidRut(cleanRut)) return sendJSON(res, 400, { error: 'RUT inválido.' });
  }

  const updated = {
    rut: cleanRut,
    first_name: (first_name ?? customer.first_name).toUpperCase(),
    last_name:  (last_name  ?? customer.last_name).toUpperCase(),
    birth_date: birth_date ?? customer.birth_date,
    email: email ?? customer.email,
    whatsapp_number: whatsapp_number ?? customer.whatsapp_number
  };
  // Validar año
  if (updated.birth_date) {
    const yr = parseInt(updated.birth_date.split('-')[0], 10);
    if (isNaN(yr) || yr < 1900 || yr > 2100) {
      return sendJSON(res, 400, { error: 'Fecha inválida. El año debe estar entre 1900 y 2100.' });
    }
  }

  try {
    db.prepare('UPDATE customers SET rut=?, first_name=?, last_name=?, birth_date=?, email=?, whatsapp_number=? WHERE id=?')
      .run(updated.rut, updated.first_name, updated.last_name, updated.birth_date, updated.email, updated.whatsapp_number, id);
    logAudit(staff.id, 'update', 'customer', Number(id), customer, updated);
    sendJSON(res, 200, { updated: true });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return sendJSON(res, 409, { error: 'Ese RUT, email o WhatsApp ya pertenece a otro cliente.' });
    }
    sendJSON(res, 500, { error: err.message });
  }
}

function deleteCustomerAdmin(req, res, id) {
  const staff = requireAdmin(req, res);
  if (!staff) return;

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return sendJSON(res, 404, { error: 'Cliente no encontrado.' });

  const cards = db.prepare('SELECT id FROM loyalty_cards WHERE customer_id = ?').all(id);
  for (const card of cards) {
    db.prepare('DELETE FROM reward_redemptions WHERE loyalty_card_id = ?').run(card.id);
    db.prepare('DELETE FROM stamp_events WHERE loyalty_card_id = ?').run(card.id);
  }
  db.prepare('DELETE FROM loyalty_cards WHERE customer_id = ?').run(id);
  db.prepare('DELETE FROM purchases WHERE customer_id = ?').run(id);
  db.prepare('DELETE FROM notifications_log WHERE customer_id = ?').run(id);
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);

  logAudit(staff.id, 'delete', 'customer', Number(id), customer, null);
  sendJSON(res, 200, { deleted: true });
}

function searchCustomerByRut(req, res, rut) {
  const staff = getAuthenticatedStaff(req);
  if (!staff) return sendJSON(res, 401, { error: 'Debes iniciar sesión como cajero.' });

  const cleanRut = decodeURIComponent(rut).trim().replace(/\./g, '').toUpperCase();
  const customer = db.prepare('SELECT * FROM customers WHERE rut = ?').get(cleanRut);
  if (!customer) return sendJSON(res, 404, { error: 'No se encontró ningún cliente con ese RUT.' });

  const card = db.prepare(`
    SELECT lc.*, lp.name as program_name, lp.required_stamps
    FROM loyalty_cards lc JOIN loyalty_programs lp ON lp.id = lc.program_id
    WHERE lc.customer_id = ?
    ORDER BY lc.id DESC LIMIT 1
  `).get(customer.id);

  if (!card) return sendJSON(res, 404, { error: 'El cliente existe pero no tiene una tarjeta activa.' });

  sendJSON(res, 200, {
    customer: { id: customer.id, rut: customer.rut, first_name: customer.first_name, last_name: customer.last_name },
    card
  });
}

function getCard(req, res, token) {
  const card = getCardFull(token);
  if (!card) return sendJSON(res, 404, { error: 'Tarjeta no encontrada' });
  sendJSON(res, 200, card);
}

async function createPurchase(req, res) {
  const staff = getAuthenticatedStaff(req);
  if (!staff) return sendJSON(res, 401, { error: 'Debes iniciar sesión como cajero para asignar marcas.' });

  const body = await readBody(req);
  const { card_token, branch_id, receipt_number } = body;
  const amount = body.amount != null ? body.amount : 0;
  const category = body.category;
  const staff_id = staff.id;

  if (!card_token || !branch_id || !receipt_number) {
    return sendJSON(res, 400, { error: 'Faltan campos: card_token, branch_id, receipt_number' });
  }

  const card = getCardFull(card_token);
  if (!card) return sendJSON(res, 404, { error: 'Tarjeta no encontrada' });
  if (card.status !== 'active') {
    return sendJSON(res, 400, { error: `Tarjeta en estado ${card.status}, no se pueden registrar más marcas.` });
  }

  try {
    const purchaseResult = db.prepare(`
      INSERT INTO purchases (customer_id, branch_id, receipt_number, amount, category, created_by_staff_id)
      VALUES (?,?,?,?,?,?)
    `).run(card.customer_id, branch_id, receipt_number, amount, category || null, staff_id || null);

    const purchaseId = Number(purchaseResult.lastInsertRowid);
    logAudit(staff_id, 'create', 'purchase', purchaseId, null, body);

    const stampResult = db.prepare(`
      INSERT INTO stamp_events (loyalty_card_id, purchase_id, staff_id, branch_id, type)
      VALUES (?,?,?,?,'grant')
    `).run(card.id, purchaseId, staff_id || null, branch_id);

    logAudit(staff_id, 'create', 'stamp_event', Number(stampResult.lastInsertRowid), null, { purchase_id: purchaseId });

    const newStamps = card.current_stamps + 1;
    const newStatus = newStamps >= card.required_stamps ? 'completed' : 'active';
    db.prepare('UPDATE loyalty_cards SET current_stamps = ?, status = ? WHERE id = ?')
      .run(newStamps, newStatus, card.id);

    db.prepare(`INSERT INTO notifications_log (customer_id, channel, message_type, content)
                VALUES (?,?,?,?)`)
      .run(card.customer_id, 'whatsapp', newStatus === 'completed' ? 'premio_desbloqueado' : 'marca_nueva',
           `Ahora tienes ${newStamps}/${card.required_stamps} marcas.`);

    sendJSON(res, 201, {
      purchase_id: purchaseId,
      stamp_granted: true,
      current_stamps: newStamps,
      card_status: newStatus
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return sendJSON(res, 409, { error: 'Esa boleta ya fue registrada en esta sucursal.' });
    }
    sendJSON(res, 500, { error: err.message });
  }
}

async function revokeStamp(req, res, stampId) {
  const staff = getAuthenticatedStaff(req);
  if (!staff) return sendJSON(res, 401, { error: 'Debes iniciar sesión como cajero para anular marcas.' });

  const body = await readBody(req);
  const { reason } = body;
  const staff_id = staff.id;
  if (!reason) return sendJSON(res, 400, { error: 'El motivo (reason) es obligatorio para anular una marca.' });

  const original = db.prepare('SELECT * FROM stamp_events WHERE id = ? AND type = "grant"').get(stampId);
  if (!original) return sendJSON(res, 404, { error: 'Marca no encontrada o ya anulada.' });

  const revokeResult = db.prepare(`
    INSERT INTO stamp_events (loyalty_card_id, purchase_id, staff_id, branch_id, type, reason)
    VALUES (?,?,?,?,'revoke',?)
  `).run(original.loyalty_card_id, original.purchase_id, staff_id || null, original.branch_id, reason);

  db.prepare("UPDATE loyalty_cards SET current_stamps = MAX(0, current_stamps - 1), status = 'active' WHERE id = ?")
    .run(original.loyalty_card_id);

  logAudit(staff_id, 'revoke', 'stamp_event', Number(revokeResult.lastInsertRowid), original, { reason });

  sendJSON(res, 200, { revoked: true, reason });
}

async function redeemCard(req, res, token) {
  const staff = getAuthenticatedStaff(req);
  if (!staff) return sendJSON(res, 401, { error: 'Debes iniciar sesión como cajero para canjear premios.' });

  const body = await readBody(req);
  const { rut } = body;
  if (!rut) return sendJSON(res, 400, { error: 'Debes validar el RUT del cliente para canjear el premio.' });

  const staff_id = staff.id;
  const card = getCardFull(token);
  if (!card) return sendJSON(res, 404, { error: 'Tarjeta no encontrada' });
  if (card.status !== 'completed') return sendJSON(res, 400, { error: 'La tarjeta aún no completa las marcas requeridas.' });

  const cleanRut = rut.trim().replace(/\./g, '').toUpperCase();
  if (cleanRut !== card.rut) {
    logAudit(staff_id, 'redeem_rut_mismatch', 'loyalty_card', card.id, { expected: card.rut }, { entered: cleanRut });
    return sendJSON(res, 403, { error: 'El RUT ingresado no coincide con el dueño de la tarjeta. No se puede canjear.' });
  }

  const reward = db.prepare('SELECT * FROM rewards WHERE program_id = ? LIMIT 1').get(card.program_id);

  const redemption = db.prepare(`
    INSERT INTO reward_redemptions (loyalty_card_id, reward_id, staff_id, branch_id)
    VALUES (?,?,?,?)
  `).run(card.id, reward ? reward.id : null, staff_id || null, null);

  db.prepare("UPDATE loyalty_cards SET current_stamps = 0, status = 'active' WHERE id = ?").run(card.id);

  logAudit(staff_id, 'redeem', 'reward_redemption', Number(redemption.lastInsertRowid), null, { card_id: card.id });

  sendJSON(res, 200, { redeemed: true, reward: reward ? reward.name : 'Premio' });
}

function getProgram(req, res, id) {
  const program = db.prepare('SELECT * FROM loyalty_programs WHERE id = ?').get(id);
  if (!program) return sendJSON(res, 404, { error: 'Programa no encontrado' });
  sendJSON(res, 200, program);
}

function listPrograms(req, res) {
  sendJSON(res, 200, db.prepare('SELECT * FROM loyalty_programs').all());
}

async function updateProgramDesign(req, res, id) {
  const staff = requireSuperAdmin(req, res);
  if (!staff) return;
  const program = db.prepare('SELECT * FROM loyalty_programs WHERE id = ?').get(id);
  if (!program) return sendJSON(res, 404, { error: 'Programa no encontrado' });

  const body = await readBody(req);
  const { name, required_stamps, logo_url, logo_width, primary_color, secondary_color, stamp_icon, stamp_color, stamp_size } = body;

  if (required_stamps != null && (!Number.isInteger(required_stamps) || required_stamps < 1 || required_stamps > 30)) {
    return sendJSON(res, 400, { error: 'required_stamps debe ser un entero entre 1 y 30.' });
  }
  if (logo_width != null && (!Number.isInteger(logo_width) || logo_width < 50 || logo_width > 140)) {
    return sendJSON(res, 400, { error: 'logo_width debe ser un entero entre 50 y 140.' });
  }
  if (stamp_size != null && (!Number.isInteger(stamp_size) || stamp_size < 10 || stamp_size > 25)) {
    return sendJSON(res, 400, { error: 'stamp_size debe ser un entero entre 10 y 25.' });
  }
  const hexColor = /^#[0-9A-Fa-f]{6}$/;
  if (primary_color && !hexColor.test(primary_color)) return sendJSON(res, 400, { error: 'primary_color debe ser un hex válido, ej. #16321f' });
  if (secondary_color && !hexColor.test(secondary_color)) return sendJSON(res, 400, { error: 'secondary_color debe ser un hex válido, ej. #0f1115' });
  if (stamp_color && !hexColor.test(stamp_color)) return sendJSON(res, 400, { error: 'stamp_color debe ser un hex válido, ej. #d62828' });

  const updated = {
    name: name ?? program.name,
    required_stamps: required_stamps ?? program.required_stamps,
    logo_url: logo_url ?? program.logo_url,
    logo_width: logo_width ?? program.logo_width,
    primary_color: primary_color ?? program.primary_color,
    secondary_color: secondary_color ?? program.secondary_color,
    stamp_icon: stamp_icon ?? program.stamp_icon,
    stamp_color: stamp_color ?? program.stamp_color,
    stamp_size: stamp_size ?? program.stamp_size
  };

  db.prepare(`UPDATE loyalty_programs SET name=?, required_stamps=?, logo_url=?, logo_width=?, primary_color=?, secondary_color=?, stamp_icon=?, stamp_color=?, stamp_size=? WHERE id=?`)
    .run(updated.name, updated.required_stamps, updated.logo_url, updated.logo_width, updated.primary_color, updated.secondary_color, updated.stamp_icon, updated.stamp_color, updated.stamp_size, id);

  logAudit(body.staff_id, 'update', 'loyalty_program', Number(id), program, updated);

  sendJSON(res, 200, { updated: true, program: { id: Number(id), ...updated } });
}

function renderLoginUnificado(req, res) {
  const staff = getAuthenticatedStaff(req);
  if (staff) {
    res.writeHead(302, { Location: staff.role === 'admin' ? '/admin' : '/caja' });
    return res.end();
  }
  const cfg = db.prepare('SELECT * FROM login_config WHERE id = 1').get() || {};
  const logoUrl = cfg.logo_url || 'https://i.imgur.com/nJrUCee.png';
  const logoWidth = cfg.logo_width || 120;
  const bgColor = cfg.bg_color || '#f4f4f5';
  const btnColor = cfg.btn_color || '#16321f';
  const btnTexto = cfg.btn_texto || 'Ingresar';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Acceso — GETit</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,system-ui,sans-serif;background:${bgColor};margin:0;padding:20px;display:flex;min-height:100vh;align-items:center;justify-content:center;}
  .panel{max-width:380px;width:100%;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.1);}
  .logo{text-align:center;margin-bottom:20px;}
  .logo img{max-width:${logoWidth}px;max-height:80px;object-fit:contain;}
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
  <div class="logo"><img src="${logoUrl}" alt="GETit" onerror="this.style.display='none'"></div>
  <h2>Acceso al sistema</h2>
  <form id="loginForm">
    <label>Usuario</label>
    <input name="username" type="text" required autofocus>
    <label>Contraseña</label>
    <div class="pwdwrap">
      <input name="password" type="password" id="pwdInput" required>
      <button type="button" class="eyebtn" onclick="togglePwd()">👁</button>
    </div>
    <button type="submit">${btnTexto}</button>
  </form>
  <div class="err" id="loginErr"></div>
</div>
<script>
function togglePwd() {
  const i = document.getElementById('pwdInput');
  i.type = i.type === 'password' ? 'text' : 'password';
}
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
</body></html>`);
}

function renderLoginPage(res, redirectPath, title) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#f4f4f5;margin:0;padding:20px;display:flex;min-height:100vh;align-items:center;justify-content:center;}
  .panel{max-width:380px;width:100%;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.1);}
  label{display:block;font-size:13px;font-weight:600;margin-top:14px;margin-bottom:4px;color:#333;}
  input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:15px;}
  .pwdwrap{position:relative;}
  .pwdwrap input{padding-right:40px;}
  .eyebtn{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;padding:4px;margin:0;width:auto;color:#666;}
  button{margin-top:20px;width:100%;padding:12px;background:#16321f;color:#fff;border:none;border-radius:6px;font-size:16px;cursor:pointer;}
  h2{margin-top:0;}
  .err{margin-top:14px;padding:12px;border-radius:8px;font-size:14px;background:#fdeaea;color:#a01818;display:none;}
</style></head>
<body>
<div class="panel">
  <h2>${title}</h2>
  <form id="loginForm">
    <label>Usuario</label>
    <input name="username" type="text" required autofocus>
    <label>Contraseña</label>
    <div class="pwdwrap">
      <input name="password" type="password" id="pwdInput" required>
      <button type="button" class="eyebtn" onclick="togglePwd()">👁</button>
    </div>
    <button type="submit">Ingresar</button>
  </form>
  <div class="err" id="loginErr"></div>
</div>
<script>
function togglePwd() {
  const i = document.getElementById('pwdInput');
  i.type = i.type === 'password' ? 'text' : 'password';
}
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
  const data = await r.json();
  const err = document.getElementById('loginErr');
  if (r.ok) {
    window.location.href = '${redirectPath}';
  } else {
    err.style.display = 'block';
    err.textContent = data.error || 'Error al iniciar sesión.';
  }
});
</script>
</body></html>`);
}

function getAllDataForExport(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;

  const customers = db.prepare('SELECT * FROM customers ORDER BY id').all();
  const purchases = db.prepare('SELECT * FROM purchases ORDER BY id').all();
  const stampEvents = db.prepare('SELECT * FROM stamp_events ORDER BY id').all();
  const redemptions = db.prepare(`
    SELECT rr.*, c.rut, c.first_name, c.last_name
    FROM reward_redemptions rr
    JOIN loyalty_cards lc ON lc.id = rr.loyalty_card_id
    JOIN customers c ON c.id = lc.customer_id
    ORDER BY rr.id
  `).all();
  const cards = db.prepare('SELECT * FROM loyalty_cards ORDER BY id').all();
  const salesDetail = db.prepare('SELECT * FROM sales_detail ORDER BY id').all();
  const stats = getDashboardStats();
  const analytics = getSalesAnalytics();

  sendJSON(res, 200, { customers, purchases, stampEvents, redemptions, cards, salesDetail, stats, analytics });
}

function normalizeRut(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toUpperCase().replace(/\./g, '');
  if (!s.includes('-') && s.length > 1) s = s.slice(0, -1) + '-' + s.slice(-1);
  return s;
}

async function importRegistry(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;

  const body = await readBody(req);
  const rows = body.rows || [];
  const batch = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO loyalty_registry (rut, nombre, fecha_nac, correo, boleta, stickers, dia, mes, cajero, import_batch)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);

  let inserted = 0;
  for (const row of rows) {
    insert.run(
      normalizeRut(row.rut) || row.rut || null,
      row.nombre || null,
      row.fechaNac || null,
      row.correo || null,
      row.boleta != null ? String(row.boleta).trim() : null,
      row.stickers != null ? parseInt(row.stickers, 10) : null,
      row.dia != null ? parseInt(row.dia, 10) : null,
      row.mes != null ? parseInt(row.mes, 10) : null,
      row.cajero || null,
      batch
    );
    inserted++;
  }

  logAudit(staff.id, 'import', 'loyalty_registry', null, null, { inserted });
  sendJSON(res, 200, { inserted });
}

function clearRegistry(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  db.prepare('DELETE FROM loyalty_registry').run();
  sendJSON(res, 200, { cleared: true });
}

function listRegistry(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  const rows = db.prepare('SELECT * FROM loyalty_registry ORDER BY id DESC LIMIT 2000').all();
  sendJSON(res, 200, rows);
}

async function importSales(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;

  const body = await readBody(req);
  const rows = body.rows || [];
  const batch = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO sales_detail (rut, documento, fecha, hora, cajero, producto, grupo, cantidad, total_neto, total_bruto, import_batch)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);

  let inserted = 0;
  for (const row of rows) {
    insert.run(
      normalizeRut(row.rut) || null,
      row.documento != null ? String(row.documento).trim() : null,
      row.fecha || null,
      row.hora || null,
      row.cajero || null,
      row.producto || null,
      row.grupo || null,
      row.cantidad || 0,
      row.totalNeto || 0,
      row.totalBruto || 0,
      batch
    );
    inserted++;
  }

  logAudit(staff.id, 'import', 'sales_detail', null, null, { inserted });
  sendJSON(res, 200, { inserted });
}

// ── Gestión de usuarios ──────────────────────────────────
function listUsers(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  const rows = db.prepare(`
    SELECT id, name, username, email, role, active, branch_id,
           (SELECT COUNT(*) FROM sessions WHERE staff_id = staff_users.id AND expires_at > ?) as active_sessions
    FROM staff_users ORDER BY id ASC
  `).all(Date.now());
  sendJSON(res, 200, rows);
}

async function createUser(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  const body = await readBody(req);
  const { name, username, password, role, branch_id } = body;
  if (!name || !username || !password || !role) {
    return sendJSON(res, 400, { error: 'Faltan campos: name, username, password, role' });
  }
  const validRoles = ['cashier','admin','superadmin'];
  if (!validRoles.includes(role)) {
    return sendJSON(res, 400, { error: 'Rol inválido. Debe ser cashier, admin o superadmin.' });
  }
  if (password.length < 4) {
    return sendJSON(res, 400, { error: 'La contraseña debe tener al menos 4 caracteres.' });
  }
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const email = `${username}@local.app`;
    const result = db.prepare(
      'INSERT INTO staff_users (branch_id, name, username, email, password_hash, role) VALUES (?,?,?,?,?,?)'
    ).run(branch_id || 1, name.trim(), username.trim().toLowerCase(), email, `${salt}:${hash}`, role);
    logAudit(staff.id, 'create', 'staff_user', Number(result.lastInsertRowid), null, { name, username, role });
    sendJSON(res, 201, { created: true, id: Number(result.lastInsertRowid) });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return sendJSON(res, 409, { error: 'El nombre de usuario ya existe.' });
    sendJSON(res, 500, { error: err.message });
  }
}

async function resetUserPassword(req, res, id) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  const body = await readBody(req);
  const { password } = body;
  if (!password || password.length < 4) {
    return sendJSON(res, 400, { error: 'La contraseña debe tener al menos 4 caracteres.' });
  }
  const target = db.prepare('SELECT * FROM staff_users WHERE id = ?').get(id);
  if (!target) return sendJSON(res, 404, { error: 'Usuario no encontrado.' });
  if (target.role === 'superadmin' && staff.role !== 'superadmin') {
    return sendJSON(res, 403, { error: 'No tienes permisos para cambiar la contraseña del administrador principal.' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  db.prepare('UPDATE staff_users SET password_hash = ? WHERE id = ?').run(`${salt}:${hash}`, id);
  // Cerrar sesiones activas del usuario
  db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(id);
  logAudit(staff.id, 'reset_password', 'staff_user', Number(id), null, null);
  sendJSON(res, 200, { updated: true });
}

async function updateUser(req, res, id) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  const body = await readBody(req);
  const target = db.prepare('SELECT * FROM staff_users WHERE id = ?').get(id);
  if (!target) return sendJSON(res, 404, { error: 'Usuario no encontrado.' });
  // Solo superadmin puede modificar a otro superadmin
  if (target.role === 'superadmin' && staff.role !== 'superadmin') {
    return sendJSON(res, 403, { error: 'No tienes permisos para modificar al administrador principal.' });
  }
  // No permitir que el admin se desactive a sí mismo
  if (Number(id) === staff.id && body.active === 0) {
    return sendJSON(res, 400, { error: 'No puedes desactivarte a ti mismo.' });
  }
  const updated = {
    name: body.name ?? target.name,
    role: body.role ?? target.role,
    active: body.active ?? target.active,
    branch_id: body.branch_id ?? target.branch_id
  };
  if (!['cashier','admin','superadmin'].includes(updated.role)) {
    return sendJSON(res, 400, { error: 'Rol inválido.' });
  }
  db.prepare('UPDATE staff_users SET name=?, role=?, active=?, branch_id=? WHERE id=?')
    .run(updated.name, updated.role, updated.active, updated.branch_id, id);
  if (body.active === 0) {
    db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(id);
  }
  logAudit(staff.id, 'update', 'staff_user', Number(id), target, updated);
  sendJSON(res, 200, { updated: true });
}

function deleteUser(req, res, id) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  if (Number(id) === staff.id) {
    return sendJSON(res, 400, { error: 'No puedes eliminar tu propio usuario.' });
  }
  const target = db.prepare('SELECT * FROM staff_users WHERE id = ?').get(id);
  if (target && target.role === 'superadmin' && staff.role !== 'superadmin') {
    return sendJSON(res, 403, { error: 'No tienes permisos para eliminar al administrador principal.' });
  }
  if (!target) return sendJSON(res, 404, { error: 'Usuario no encontrado.' });
  db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(id);
  db.prepare('DELETE FROM staff_users WHERE id = ?').run(id);
  logAudit(staff.id, 'delete', 'staff_user', Number(id), target, null);
  sendJSON(res, 200, { deleted: true });
}

function getTycConfig(req, res) {
  let cfg = {};
  try { cfg = db.prepare('SELECT * FROM tyc_config WHERE id = 1').get() || {}; } catch(e) {}
  sendJSON(res, 200, cfg);
}

async function updateTycConfig(req, res) {
  const staff = requireSuperAdmin(req, res);
  if (!staff) return;
  const body = await readBody(req);
  const fields = ['logo_url','logo_width','bg_color','card_color','title_color','h2_color','text_color',
    'razon_social','rut','nombre_fantasia','domicilio','titulo','fecha_actualizacion',
    's1_titulo','s1_texto','s2_titulo','s2_texto','s3_titulo','s3_texto','s4_titulo','s4_texto',
    's5_titulo','s5_texto','s6_titulo','s6_texto','s7_titulo','s7_texto','s8_titulo','s8_texto'];
  const sets = fields.filter(f => body[f] !== undefined).map(f => `${f} = ?`).join(', ');
  const vals = fields.filter(f => body[f] !== undefined).map(f => body[f]);
  if (sets) db.prepare(`UPDATE tyc_config SET ${sets} WHERE id = 1`).run(...vals);
  sendJSON(res, 200, { updated: true });
}

function getLoginConfig(req, res) {
  const cfg = db.prepare('SELECT * FROM login_config WHERE id = 1').get();
  sendJSON(res, 200, cfg || {});
}

async function updateLoginConfig(req, res) {
  const staff = requireSuperAdmin(req, res);
  if (!staff) return;
  const body = await readBody(req);
  const fields = ['logo_url','logo_width','bg_color','btn_color','btn_texto'];
  const sets = fields.filter(f => body[f] !== undefined).map(f => `${f} = ?`).join(', ');
  const vals = fields.filter(f => body[f] !== undefined).map(f => body[f]);
  if (sets) db.prepare(`UPDATE login_config SET ${sets} WHERE id = 1`).run(...vals);
  sendJSON(res, 200, { updated: true });
}

function getRegistroConfig(req, res) {
  const cfg = db.prepare('SELECT * FROM registro_config WHERE id = 1').get();
  sendJSON(res, 200, cfg || {});
}

async function updateRegistroConfig(req, res) {
  const staff = requireSuperAdmin(req, res);
  if (!staff) return;
  const body = await readBody(req);
  const fields = ['logo_url','logo_width','titulo','subtitulo','bg_color','btn_color','btn_texto',
    'campo_rut','campo_nombre','campo_apellido','campo_correo','campo_telefono','campo_nacimiento',
    'chk1_texto','chk2_texto','tyc_texto'];
  const sets = fields.filter(f => body[f] !== undefined).map(f => `${f} = ?`).join(', ');
  const vals = fields.filter(f => body[f] !== undefined).map(f => body[f]);
  if (sets) db.prepare(`UPDATE registro_config SET ${sets} WHERE id = 1`).run(...vals);
  sendJSON(res, 200, { updated: true });
}

function clearSalesDetail(req, res) {
  const staff = requireAdmin(req, res);
  if (!staff) return;
  db.prepare('DELETE FROM sales_detail').run();
  sendJSON(res, 200, { cleared: true });
}

function getSalesAnalytics() {
  const totalSold = db.prepare(`
    SELECT COALESCE(SUM(sd.total_bruto), 0) as total
    FROM sales_detail sd
    WHERE sd.documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)
  `).get().total;

  const ticketPromedio = db.prepare(`
    SELECT AVG(doc_total) as avg_ticket FROM (
      SELECT documento, SUM(total_bruto) as doc_total
      FROM sales_detail WHERE documento IS NOT NULL GROUP BY documento
    )
  `).get().avg_ticket || 0;

  const perClient = db.prepare(`
    SELECT lr.rut, MIN(lr.nombre) as nombre,
           COALESCE(SUM(sd.total_bruto), 0) as total_comprado,
           COUNT(DISTINCT sd.documento) as boletas
    FROM loyalty_registry lr
    LEFT JOIN sales_detail sd ON sd.documento = lr.boleta
    WHERE lr.rut IS NOT NULL
    GROUP BY lr.rut
    ORDER BY total_comprado DESC
    LIMIT 20
  `).all();

  const topProducts = db.prepare(`
    SELECT producto, SUM(cantidad) as cantidad_total, SUM(total_bruto) as monto_total
    FROM sales_detail
    WHERE producto IS NOT NULL AND documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)
    GROUP BY producto ORDER BY cantidad_total DESC LIMIT 10
  `).all();

  const bottomProducts = db.prepare(`
    SELECT producto, SUM(cantidad) as cantidad_total, SUM(total_bruto) as monto_total
    FROM sales_detail
    WHERE producto IS NOT NULL AND documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)
    GROUP BY producto ORDER BY cantidad_total ASC LIMIT 10
  `).all();

  const cashierRanking = db.prepare(`
    SELECT cajero, COUNT(*) as clientes_fidelizados
    FROM loyalty_registry WHERE cajero IS NOT NULL
    GROUP BY cajero ORDER BY clientes_fidelizados DESC LIMIT 10
  `).all();

  const hourBrackets = db.prepare(`
    SELECT CAST(SUBSTR(sd.hora, 1, 2) AS INTEGER) as hora_del_dia, COUNT(*) as transacciones, SUM(sd.total_bruto) as monto
    FROM sales_detail sd
    WHERE sd.hora IS NOT NULL AND sd.documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)
    GROUP BY hora_del_dia ORDER BY hora_del_dia ASC
  `).all();

  const totalSalesRows = db.prepare('SELECT COUNT(*) c FROM sales_detail').get().c;
  const matchedRows = db.prepare(`
    SELECT COUNT(*) c FROM sales_detail WHERE documento IN (SELECT DISTINCT boleta FROM loyalty_registry WHERE boleta IS NOT NULL)
  `).get().c;
  const totalRegistryRows = db.prepare('SELECT COUNT(*) c FROM loyalty_registry').get().c;

  return { totalSold, ticketPromedio, perClient, topProducts, bottomProducts, cashierRanking, hourBrackets, totalSalesRows, matchedRows, totalRegistryRows };
}

function getDashboardStats() {
  const customers = db.prepare('SELECT COUNT(*) c FROM customers').get().c;
  const activeCards = db.prepare("SELECT COUNT(*) c FROM loyalty_cards WHERE status = 'active'").get().c;
  const completedCards = db.prepare("SELECT COUNT(*) c FROM loyalty_cards WHERE status = 'completed'").get().c;
  const purchases = db.prepare('SELECT COUNT(*) c FROM purchases').get().c;
  const grantedStamps = db.prepare("SELECT COUNT(*) c FROM stamp_events WHERE type = 'grant'").get().c;
  const redemptions = db.prepare('SELECT COUNT(*) c FROM reward_redemptions').get().c;
  const topCustomers = db.prepare(`
    SELECT c.rut, c.first_name, c.last_name, COUNT(p.id) as total_purchases
    FROM customers c JOIN purchases p ON p.customer_id = c.id
    GROUP BY c.id ORDER BY total_purchases DESC LIMIT 10
  `).all();
  return { customers, activeCards, completedCards, purchases, grantedStamps, redemptions, topCustomers };
}

function renderAdminPage(req, res) {
  const staff = getAuthenticatedStaff(req);
  if (!staff || !['admin','superadmin'].includes(staff.role)) {
    res.writeHead(302, { Location: '/login' }); return res.end();
  }
  const programs = db.prepare('SELECT * FROM loyalty_programs').all();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  try {
  res.end(`<!DOCTYPE html>
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
  td{padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle;}
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

    <!-- SUB-PANEL DISEÑO DE TARJETA (copia del panel existente pero dentro de interfaz editable) -->
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
              <input type="range" id="lc_logo_width" min="40" max="300" value="120" oninput="syncRange(this,'lc_logo_width_val');updateLoginPreview()">
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
            <div style="text-align:center;margin-bottom:10px;"><img id="lp_logo" style="max-width:80px;max-height:40px;object-fit:contain;"></div>
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
              <input type="range" id="rc_logo_width" min="40" max="300" value="140" oninput="syncRange(this,'rc_logo_width_val');updateRegPreview()">
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
            <div style="text-align:center;margin-bottom:8px;"><img id="rp_logo" style="max-width:90px;max-height:44px;object-fit:contain;"></div>
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
          <span class="rangeval" id="tyc_logo_width_val">120px</span>
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
        ${[1,2,3,4,5,6,7,8].map(n => `
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

    <!-- MODAL TYC (legacy, ya no se usa) -->
    <div id="tycModal" style="display:none;"></div>
  </div>

  <!-- PESTAÑA DISEÑO -->
  <div id="tabDiseno" style="display:none;">
  ${programs.map(p => `
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
          <label>Tamaño del logo (máximo 140px)</label>
          <div class="rangerow">
            <input type="range" name="logo_width" min="50" max="140" value="${p.logo_width || 140}" oninput="syncRange(this,'logo_width_val_${p.id}');updatePreview(${p.id})">
            <span class="rangeval" id="logo_width_val_${p.id}">${p.logo_width || 140}px</span>
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
            ${['★','✦','✱','✓','✪'].map(ic => `<button type="button" class="iconbtn ${(p.stamp_icon||'★')===ic?'active':''}" onclick="document.getElementById('stamp-icon-${p.id}').value='${ic}';updatePreview(${p.id})">${ic}</button>`).join('')}
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
        <div class="preview-card" id="preview-card-${p.id}" style="background:${p.primary_color||'#000'};">
          <img id="preview-logo-${p.id}" src="${p.logo_url||''}" style="width:min(${p.logo_width||140}px,80%);max-height:60px;object-fit:contain;display:${p.logo_url?'block':'none'};">
          <div class="preview-brand" id="preview-brand-${p.id}">${p.name||''}</div>
          <div class="preview-qr">QR</div>
          <div class="preview-grid" id="preview-grid-${p.id}"></div>
          <div class="preview-progress">VISITAS: 0 / ${p.required_stamps||10}</div>
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
<script>
const CURRENT_ROLE = document.body.dataset.role || 'admin';
function switchAdminTab(tab) {
  ['clientes','diseno','registro','usuarios'].forEach(t => {
    const btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
    const panel = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.className = 'tabbtn' + (tab === t ? ' active' : '');
    if (panel) panel.style.display = tab === t ? 'block' : 'none';
  });
  if (tab === 'clientes') loadCustomers();
  if (tab === 'registro') showIface('login');
  if (tab === 'usuarios') loadUsers();
}

async function logout() {
  await fetch('/api/auth/logout', { method:'POST' });
  window.location.href = '/login';
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
      '<td>' + c.rut + '</td>' +
      '<td>' + c.first_name + ' ' + c.last_name + '</td>' +
      '<td>' + (c.birth_date ? c.birth_date.split('-').reverse().join('-') : '—') + '</td>' +
      '<td>' + (c.email || '') + '</td>' +
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
    '<h3>' + d.customer.first_name + ' ' + d.customer.last_name + ' (' + d.customer.rut + ')</h3>' +
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
  document.getElementById('rc_tyc').value = cfg.tyc_texto || '';
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
  set('tyc_titulo', cfg.titulo); set('tyc_fecha', cfg.fecha_actualizacion);
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
function updateTycPreview() {} // placeholder por si se agrega preview en el futuro

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

${programs.map(p => `updatePreview(${p.id});`).join('\n')}
loadCustomers();

// ── Usuarios ──────────────────────────────────────────────
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

    // Badge de rol: admin no ve el rol del superadmin
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

    // Admin no puede tocar al superadmin
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
      // Admin puede editar/eliminar cajeros y otros admins (no superadmin)
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
  field('Contraseña','um_pwd','password','Mínimo 4 caracteres');
  var rl = document.createElement('label'); rl.style.cssText='display:block;font-size:13px;font-weight:600;margin-bottom:4px;'; rl.textContent='Rol'; box.appendChild(rl);
  var sel = document.createElement('select'); sel.id='um_role';
  sel.style.cssText='width:100%;padding:9px;border:1.5px solid #ddd;border-radius:7px;font-size:14px;box-sizing:border-box;margin-bottom:14px;';
  [['cashier','Cajero'],['admin','Administrador'],['superadmin','Super Admin']].forEach(function(op){ var o=document.createElement('option'); o.value=op[0]; o.textContent=op[1]; sel.appendChild(o); }); box.appendChild(sel);
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
  [['cashier','Cajero'],['admin','Administrador'],['superadmin','Super Admin']].forEach(function(op){ var o=document.createElement('option'); o.value=op[0]; o.textContent=op[1]; if(u.role===op[0]) o.selected=true; sel.appendChild(o); }); box.appendChild(sel);
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
  field('Nueva contraseña','rp_pwd','Mínimo 4 caracteres');
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
  if(pwd.length<4){ err.textContent='Mínimo 4 caracteres.'; err.style.display='block'; return; }
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
</body></html>`);
  } catch(e) { console.error('ADMIN ERROR:', e.message); }
}

async function renderCardPage(req, res, token) {
  const card = getCardFull(token);
  if (!card) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<h1>Tarjeta no encontrada</h1>');
  }

  let qrHtml;
  if (QRCode) {
    const cardUrl = `${BASE_URL}/tarjeta/${card.unique_token}`;
    const qrDataUrl = await QRCode.toDataURL(cardUrl, { width: 280, margin: 1 });
    qrHtml = `<img src="${qrDataUrl}" alt="QR">`;
  } else {
    qrHtml = `<div style="padding:24px 16px;text-align:center;color:#888;font-size:13px;line-height:1.6;">QR no disponible en este entorno.<br>Usa el código de abajo para identificarte en caja.</div>`;
  }

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

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${card.program_name} - ${card.first_name}</title>
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
    <div class="name">${card.first_name} ${card.last_name}</div>
    <div class="qr">${qrHtml}</div>
    <div style="font-size:13px;letter-spacing:1px;opacity:0.85;margin-bottom:18px;">Código: <strong>${card.short_code || '—'}</strong></div>
    <div class="grid">${grid}</div>
    <div class="progress">VISITAS: ${card.current_stamps} / ${card.required_stamps}</div>
    ${statusMsg ? `<div class="status">${statusMsg}</div>` : ''}
    <div class="powered">Tarjeta de solo lectura · actualizada por el sistema</div>
  </div>
</body>
</html>`);
}

function buscarTarjetaPorRut(req, res, rut) {
  const cleanRut = rut.trim().replace(/\./g, '').toUpperCase();
  const customer = db.prepare('SELECT * FROM customers WHERE rut = ?').get(cleanRut);
  if (!customer) return sendJSON(res, 404, { error: 'No encontramos ningún cliente con ese RUT. Verifica que esté escrito sin puntos y con guión (ej: 12345678-5).' });
  const card = db.prepare(`
    SELECT lc.*, lp.name as program_name, lp.required_stamps, lp.primary_color, lp.secondary_color
    FROM loyalty_cards lc JOIN loyalty_programs lp ON lp.id = lc.program_id
    WHERE lc.customer_id = ? ORDER BY lc.id DESC LIMIT 1
  `).get(customer.id);
  if (!card) return sendJSON(res, 404, { error: 'Este cliente no tiene tarjeta activa.' });
  sendJSON(res, 200, { token: card.unique_token });
}

function renderMiTarjetaPage(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
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
<script>

function formatRut(val) {
  let v = val.replace(/[^0-9kK]/g, '').toUpperCase();
  if (v.length < 2) return v;
  const dv = v.slice(-1);
  const body = v.slice(0, -1);
  return body + '-' + dv;
}
function onRutInput(e) {
  e.target.value = formatRut(e.target.value);
}
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
</body></html>`);
}

function renderRegisterPage(req, res) {
  const cfg = db.prepare('SELECT * FROM registro_config WHERE id = 1').get() || {};
  const logoUrl = cfg.logo_url || 'https://i.imgur.com/nJrUCee.png';
  const logoWidth = cfg.logo_width || 140;
  const titulo = cfg.titulo || 'Club de Fidelización';
  const subtitulo = cfg.subtitulo || 'Regístrate y acumula marcas con tus compras';
  const btnColor = cfg.btn_color || '#16321f';
  const btnTexto = cfg.btn_texto || 'Crear mi tarjeta';
  const showRut    = cfg.campo_rut !== 0;
  const showNombre = cfg.campo_nombre !== 0;
  const showApell  = cfg.campo_apellido !== 0;
  const showEmail  = cfg.campo_correo !== 0;
  const showTel    = cfg.campo_telefono !== 0;
  const showNac    = cfg.campo_nacimiento !== 0;
  const chk1 = cfg.chk1_texto || 'He leído y acepto los Términos y Condiciones del Club de Fidelización GETit.';
  const chk2 = cfg.chk2_texto || 'Autorizo a GETit a usar mis datos personales para gestionar mi membresía y enviarme comunicaciones sobre ofertas, promociones y beneficios del club.';
  const bgColor = cfg.bg_color || '#f4f4f5';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Registro Club GETit</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,system-ui,sans-serif;background:${bgColor};margin:0;padding:20px;}
  .panel{max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:24px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.1);}
  .logo{text-align:center;margin-bottom:16px;}
  .logo img{max-width:${logoWidth}px;max-height:100px;object-fit:contain;}
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
    <input type="date" name="birth_date">` : ''}

    <div class="check-group">
      <label class="check-item">
        <input type="checkbox" id="chk1" required>
        <span>He leído y acepto los <a href="/terminos" target="_blank" style="color:#16321f;font-weight:700;">Términos y Condiciones</a> del Club de Fidelización GETit.</span>
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
<script>
function formatRut(val) {
  let v = val.replace(/[^0-9kK]/g, '').toUpperCase();
  if (v.length < 2) return v;
  return v.slice(0,-1) + '-' + v.slice(-1);
}
function onRutInput(e) { e.target.value = formatRut(e.target.value); }

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const div = document.getElementById('result');

  if (!document.getElementById('chk1').checked || !document.getElementById('chk2').checked) {
    showError('Debes aceptar ambas condiciones para continuar.');
    return;
  }

  // RUT: si el campo existe lo usa, si no genera uno temporal
  let rut;
  if (f.rut) {
    const rutRaw = f.rut.value.trim();
    const rutDigits = rutRaw.replace(/[^0-9kK]/gi, '');
    rut = rutDigits.length >= 2 ? rutDigits.slice(0,-1) + '-' + rutDigits.slice(-1).toUpperCase() : rutRaw;
  } else {
    rut = 'TEMP-' + Date.now();
  }

  // Teléfono: validar solo si el campo existe
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
</body></html>`);
}
async function renderCajaPage(req, res) {
  const staff = getAuthenticatedStaff(req);

  if (!staff) {
    res.writeHead(302, { Location: '/login' }); return res.end();
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
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
  <span>Sesión: ${staff.name} (${staff.role === 'superadmin' ? 'super administrador' : staff.role === 'admin' ? 'administrador' : 'cajero'})</span>
  <div style="display:flex;gap:8px;">
    ${['admin','superadmin'].includes(staff.role) ? '<button onclick="window.location.href=\'/admin\'">← Admin</button>' : ''}
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
<script>
let currentToken = null;

function formatRut(val) {
  let v = val.replace(/[^0-9kK]/g, '').toUpperCase();
  if (v.length < 2) return v;
  const dv = v.slice(-1);
  const body = v.slice(0, -1);
  return body + '-' + dv;
}
function onRutInput(e) {
  const sel = e.target.selectionStart;
  e.target.value = formatRut(e.target.value);
}

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

async function logout() {
  await fetch('/api/auth/logout', { method:'POST' });
  window.location.href = '/login';
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
      // Premio disponible: mostrar aviso pero no ocultar aún
      div.className = 'result ok';
      div.textContent = '¡Marca asignada! ' + data.current_stamps + '/' + (data.current_stamps >= 10 ? data.current_stamps : 10) + ' marcas. ¡Premio disponible!';
      document.getElementById('custStamps').textContent = data.current_stamps + ' marcas';
      document.getElementById('redeemBtn').style.display = 'block';
      f.reset();
    } else {
      // Marca asignada: mostrar mensaje breve y volver a buscar
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
</body></html>`);
}

async function renderQrPosterPage(req, res) {
  const registroUrl = `${BASE_URL}/registro`;
  let qrHtml;
  if (QRCode) {
    const qrDataUrl = await QRCode.toDataURL(registroUrl, { width: 400, margin: 1 });
    qrHtml = `<img src="${qrDataUrl}" alt="QR registro">`;
  } else {
    qrHtml = `<div style="font-family:monospace;word-break:break-all;padding:20px;">${registroUrl}</div>`;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
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
</body></html>`);
}

function renderTerminos(req, res) {
  // Leer config de TyC desde BD (tyc_config) o usar defaults
  let cfg = {};
  try { cfg = db.prepare('SELECT * FROM tyc_config WHERE id = 1').get() || {}; } catch(e) {}

  const logoUrl   = cfg.logo_url   || 'https://i.imgur.com/nJrUCee.png';
  const logoWidth = cfg.logo_width || 120;
  const bgColor   = cfg.bg_color   || '#f4f4f5';
  const cardColor = cfg.card_color || '#ffffff';
  const titleColor= cfg.title_color|| '#16321f';
  const h2Color   = cfg.h2_color   || '#16321f';
  const textColor = cfg.text_color || '#333333';
  const razonSocial   = cfg.razon_social   || 'Convenience de Chile SPA';
  const rut           = cfg.rut            || '76.865.177-9';
  const nombreFantasia= cfg.nombre_fantasia|| 'Get it';
  const domicilio     = cfg.domicilio      || 'Santiago, Región Metropolitana, Chile';
  const titulo        = cfg.titulo         || 'Términos y Condiciones del Club de Fidelización';
  const fechaActualizacion = cfg.fecha_actualizacion || '08 de julio de 2026';
  const s1_titulo = cfg.s1_titulo || '1. Aceptación de los términos';
  const s1_texto  = cfg.s1_texto  || 'Al registrarte en el Club de Fidelización Get it, declaras haber leído, comprendido y aceptado los presentes Términos y Condiciones. Si no estás de acuerdo con alguno de ellos, no debes completar el registro.';
  const s2_titulo = cfg.s2_titulo || '2. El programa de fidelización';
  const s2_texto  = cfg.s2_texto  || 'El Club de Fidelización Get it es un programa administrado por Convenience de Chile SPA que permite a sus miembros acumular marcas por cada visita o compra realizada en los establecimientos participantes de la marca Get it.';
  const s3_titulo = cfg.s3_titulo || '3. Registro y membresía';
  const s3_texto  = cfg.s3_texto  || 'Para participar en el programa, el cliente debe registrarse proporcionando datos verídicos y actualizados. Cada persona puede tener una sola cuenta asociada a su RUT. El registro es personal e intransferible.';
  const s4_titulo = cfg.s4_titulo || '4. Tratamiento de datos personales';
  const s4_texto  = cfg.s4_texto  || 'De conformidad con la Ley N° 19.628 sobre Protección de la Vida Privada y sus modificaciones, Convenience de Chile SPA recopila y trata los datos personales de sus miembros exclusivamente para gestionar su membresía, acreditar marcas y canjes, y enviar comunicaciones sobre ofertas y beneficios del Club de Fidelización Get it. Convenience de Chile SPA no compartirá, venderá ni cederá estos datos a terceros sin el consentimiento expreso del titular, salvo que sea requerido por ley o autoridad competente.';
  const s5_titulo = cfg.s5_titulo || '5. Derechos del titular de datos';
  const s5_texto  = cfg.s5_texto  || 'Conforme a la Ley N° 19.628, el cliente tiene derecho a acceder, rectificar y solicitar la eliminación de sus datos personales, así como revocar el consentimiento para el envío de comunicaciones comerciales. Para ejercer estos derechos, el cliente puede contactar directamente a un establecimiento Get it o escribir a través de los canales oficiales de la empresa.';
  const s6_titulo = cfg.s6_titulo || '6. Seguridad de la información';
  const s6_texto  = cfg.s6_texto  || 'Convenience de Chile SPA adopta medidas técnicas y organizativas razonables para proteger los datos personales de sus miembros contra accesos no autorizados, pérdida o alteración.';
  const s7_titulo = cfg.s7_titulo || '7. Modificaciones';
  const s7_texto  = cfg.s7_texto  || 'Convenience de Chile SPA se reserva el derecho de actualizar estos Términos y Condiciones. Las modificaciones serán informadas a través de los canales del programa y entrarán en vigencia desde su publicación. El uso continuado del programa implica la aceptación de los términos actualizados.';
  const s8_titulo = cfg.s8_titulo || '8. Legislación aplicable';
  const s8_texto  = cfg.s8_texto  || 'Estos Términos y Condiciones se rigen por las leyes de la República de Chile. Cualquier controversia derivada del presente programa será sometida a los tribunales ordinarios de justicia de Santiago.';

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,system-ui,sans-serif;background:${bgColor};margin:0;padding:20px;color:${textColor};}
  .wrap{max-width:680px;margin:0 auto;background:${cardColor};border-radius:12px;padding:32px 28px;box-shadow:0 1px 4px rgba(0,0,0,0.08);}
  .logo{text-align:center;margin-bottom:20px;}
  .logo img{max-width:120px;object-fit:contain;}
  h1{font-size:20px;color:${titleColor};margin-bottom:4px;}
  .meta{font-size:12px;color:#888;margin-bottom:28px;}
  h2{font-size:15px;color:${h2Color};margin-top:28px;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:6px;}
  p,li{font-size:14px;line-height:1.7;margin-bottom:8px;}
  ul{padding-left:20px;}
  .back{display:inline-block;margin-top:24px;font-size:13px;color:${titleColor};font-weight:600;text-decoration:none;}
  .empresa{background:#f7f7f7;border-radius:8px;padding:12px 16px;font-size:13px;margin-bottom:24px;line-height:1.8;}
</style></head>
<body>
<div class="wrap">
  <div class="logo"><img src="${logoUrl}" alt="Get it" onerror="this.style.display='none'"></div>
  <h1>${titulo}</h1>
  <div class="meta">Última actualización: ${fechaActualizacion}</div>
  <div class="empresa">
    <strong>Razón social:</strong> ${razonSocial}<br>
    <strong>RUT:</strong> ${rut}<br>
    <strong>Nombre de fantasía:</strong> ${nombreFantasia}<br>
    <strong>Domicilio:</strong> ${domicilio}
  </div>
  <h2>${s1_titulo}</h2><p>${s1_texto}</p>
  <h2>${s2_titulo}</h2><p>${s2_texto}</p>
  <ul>
    <li>Cada compra válida otorga una (1) marca en la tarjeta digital del cliente.</li>
    <li>Al completar el número de marcas definido por el programa vigente, el cliente obtiene el derecho a canjear el premio correspondiente.</li>
    <li>Las marcas no son transferibles, no tienen valor monetario y no pueden canjearse por dinero en efectivo.</li>
    <li>Convenience de Chile SPA se reserva el derecho de modificar las condiciones del programa, incluyendo la cantidad de marcas requeridas y los premios disponibles, con aviso previo a través de los canales oficiales.</li>
  </ul>
  <h2>${s3_titulo}</h2><p>${s3_texto}</p>
  <h2>${s4_titulo}</h2><p>${s4_texto}</p>
  <ul>
    <li>Nombre y apellido</li><li>RUT</li><li>Correo electrónico</li>
    <li>Número de teléfono</li><li>Fecha de nacimiento</li>
    <li>Historial de visitas y compras asociadas al programa</li>
  </ul>
  <h2>${s5_titulo}</h2><p>${s5_texto}</p>
  <ul>
    <li>Acceder a sus datos personales registrados.</li>
    <li>Rectificar datos incorrectos o desactualizados.</li>
    <li>Solicitar la eliminación de sus datos y cancelación de su membresía.</li>
    <li>Revocar el consentimiento para el envío de comunicaciones comerciales.</li>
  </ul>
  <h2>${s6_titulo}</h2><p>${s6_texto}</p>
  <h2>${s7_titulo}</h2><p>${s7_texto}</p>
  <h2>${s8_titulo}</h2><p>${s8_texto}</p>
  <a class="back" href="/registro">← Volver al registro</a>
</div>
</body></html>`);
}

function renderManifest(req, res) {
  sendJSON(res, 200, {
    name: 'Tarjeta de Fidelización',
    short_name: 'Fidelidad',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1115',
    theme_color: '#16321f'
  });
}

// ---------- Router ----------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathName = parsed.pathname;

  try {
    if (req.method === 'POST' && pathName === '/api/customers') return await createCustomer(req, res);
    if (req.method === 'GET' && pathName.startsWith('/api/cards/')) return getCard(req, res, pathName.split('/')[3]);
    if (req.method === 'POST' && pathName === '/api/purchases') return await createPurchase(req, res);
    if (req.method === 'POST' && pathName.match(/^\/api\/stamp-events\/\d+\/revoke$/)) {
      return await revokeStamp(req, res, pathName.split('/')[3]);
    }
    if (req.method === 'POST' && pathName.match(/^\/api\/cards\/[^/]+\/redeem$/)) {
      return await redeemCard(req, res, pathName.split('/')[3]);
    }
    if (req.method === 'GET' && pathName.startsWith('/tarjeta/')) return await renderCardPage(req, res, pathName.split('/')[2]);
    if (req.method === 'GET' && pathName === '/manifest.json') return renderManifest(req, res);
    if (req.method === 'GET' && pathName === '/login') return renderLoginUnificado(req, res);
    if (req.method === 'GET' && pathName === '/admin') return renderAdminPage(req, res);
    if (req.method === 'GET' && pathName === '/registro') return renderRegisterPage(req, res);
    if (req.method === 'GET' && pathName === '/mi-tarjeta') return renderMiTarjetaPage(req, res);
    if (req.method === 'GET' && pathName.match(/^\/api\/buscar-tarjeta\/.+$/)) return buscarTarjetaPorRut(req, res, decodeURIComponent(pathName.split('/api/buscar-tarjeta/')[1]));
    if (req.method === 'GET' && pathName === '/caja') return await renderCajaPage(req, res);
    if (req.method === 'POST' && pathName === '/api/auth/login') return await loginStaff(req, res);
    if (req.method === 'POST' && pathName === '/api/auth/logout') return logoutStaff(req, res);
    if (req.method === 'GET' && pathName === '/cartel-qr') return await renderQrPosterPage(req, res);
    if (req.method === 'GET' && pathName.match(/^\/api\/customers\/by-rut\/.+$/)) {
      return searchCustomerByRut(req, res, pathName.split('/api/customers/by-rut/')[1]);
    }
    if (req.method === 'GET' && pathName.match(/^\/api\/customers\/by-code\/.+$/)) {
      return searchCustomerByShortCode(req, res, pathName.split('/api/customers/by-code/')[1]);
    }
    if (req.method === 'GET' && pathName === '/api/admin/customers') return listCustomersAdmin(req, res);
    if (req.method === 'GET' && pathName.match(/^\/api\/admin\/customers\/\d+\/detail$/)) return getCustomerDetail(req, res, pathName.split('/')[4]);
    if (req.method === 'GET' && pathName === '/api/admin/download-db') return downloadDatabase(req, res);
    if (req.method === 'GET' && pathName.match(/^\/api\/admin\/lookup-boleta\/.+$/)) return lookupBoleta(req, res, pathName.split('/api/admin/lookup-boleta/')[1]);
    if (req.method === 'GET' && pathName === '/api/admin/all-data') return getAllDataForExport(req, res);
    if (req.method === 'POST' && pathName === '/api/admin/import-registry') return await importRegistry(req, res);
    if (req.method === 'GET' && pathName === '/api/admin/registry') return listRegistry(req, res);
    if (req.method === 'DELETE' && pathName === '/api/admin/registry') return clearRegistry(req, res);
    if (req.method === 'POST' && pathName === '/api/admin/import-sales') return await importSales(req, res);
    if (req.method === 'DELETE' && pathName === '/api/admin/sales-detail') return clearSalesDetail(req, res);
    if (req.method === 'PUT' && pathName.match(/^\/api\/admin\/customers\/\d+$/)) return await updateCustomerAdmin(req, res, pathName.split('/')[4]);
    if (req.method === 'DELETE' && pathName.match(/^\/api\/admin\/customers\/\d+$/)) return deleteCustomerAdmin(req, res, pathName.split('/')[4]);
    if (req.method === 'GET' && pathName === '/api/admin/programs') return listPrograms(req, res);
    if (req.method === 'GET' && pathName.match(/^\/api\/admin\/programs\/\d+$/)) return getProgram(req, res, pathName.split('/')[4]);
    if (req.method === 'PUT' && pathName.match(/^\/api\/admin\/programs\/\d+$/)) return await updateProgramDesign(req, res, pathName.split('/')[4]);

    if (req.method === 'GET' && pathName === '/api/admin/users') return listUsers(req, res);
    if (req.method === 'POST' && pathName === '/api/admin/users') return await createUser(req, res);
    if (req.method === 'PUT' && pathName.match(/^\/api\/admin\/users\/\d+$/)) return await updateUser(req, res, pathName.split('/')[4]);
    if (req.method === 'POST' && pathName.match(/^\/api\/admin\/users\/\d+\/reset-password$/)) return await resetUserPassword(req, res, pathName.split('/')[4]);
    if (req.method === 'DELETE' && pathName.match(/^\/api\/admin\/users\/\d+$/)) return deleteUser(req, res, pathName.split('/')[4]);
    if (req.method === 'GET' && pathName === '/api/admin/registro-config') return getRegistroConfig(req, res);
    if (req.method === 'PUT' && pathName === '/api/admin/registro-config') return await updateRegistroConfig(req, res);
    if (req.method === 'GET' && pathName === '/api/admin/tyc-config') return getTycConfig(req, res);
    if (req.method === 'PUT' && pathName === '/api/admin/tyc-config') return await updateTycConfig(req, res);
    if (req.method === 'GET' && pathName === '/api/admin/login-config') return getLoginConfig(req, res);
    if (req.method === 'PUT' && pathName === '/api/admin/login-config') return await updateLoginConfig(req, res);
    if (req.method === 'GET' && pathName === '/terminos') return renderTerminos(req, res);
    sendJSON(res, 404, { error: 'Ruta no encontrada' });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Acceso desde celular en la misma red WiFi: ${BASE_URL}`);
  console.log(`Panel de administración: http://localhost:${PORT}/admin`);
  console.log(`Registrar cliente: http://localhost:${PORT}/registro`);
  console.log(`Caja: http://localhost:${PORT}/caja`);
  console.log(`Cartel QR para mesón: http://localhost:${PORT}/cartel-qr`);
  const { exec } = require('child_process');
  const target = `http://localhost:${PORT}/admin`;
  const opener = process.platform === 'win32' ? `start ${target}`
    : process.platform === 'darwin' ? `open ${target}`
    : `xdg-open ${target}`;
  exec(opener, () => {});
});

module.exports = server;
