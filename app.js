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
  role TEXT CHECK(role IN ('cashier','manager','admin')) NOT NULL DEFAULT 'cashier',
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
  db.prepare(`INSERT INTO loyalty_programs (name, required_stamps, rules_json, logo_url, primary_color, secondary_color, stamp_icon)
              VALUES (?,?,?,?,?,?,?)`)
    .run('Club Fidelidad', 10, JSON.stringify({ min_amount: 0 }), '', '#16321f', '#0f1115', '★');
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
const BASE_URL = `http://${LAN_IP}:${PORT}`;
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

  const cleanRut = rut.trim().toUpperCase();
  if (!isValidRut(cleanRut)) {
    return sendJSON(res, 400, { error: 'RUT inválido. Formato esperado: 12345678-9 (sin puntos, con guión).' });
  }

  // Email autogenerado si no se proporciona
  const cleanEmail = email || (cleanRut.replace(/[^0-9kK]/g, '').toLowerCase() + '@getit.cl');
  const numMarcas = Math.min(parseInt(marcas, 10) || 1, 10);

  try {
    const result = db.prepare(`
      INSERT INTO customers (rut, first_name, last_name, birth_date, email, whatsapp_number)
      VALUES (?,?,?,?,?,?)
    `).run(cleanRut, first_name, last_name || '-', birth_date, cleanEmail, whatsapp_number || null);

    const customerId = Number(result.lastInsertRowid);
    const programId = program_id || 1;
    const token = crypto.randomUUID();
    const shortCode = generateUniqueShortCode();

    const cardResult = db.prepare(`
      INSERT INTO loyalty_cards (customer_id, program_id, unique_token, short_code, current_stamps, status)
      VALUES (?,?,?,?,?,'active')
    `).run(customerId, programId, token, shortCode, numMarcas);

    const cardId = Number(cardResult.lastInsertRowid);

    // Si viene boleta del registro, la guardamos como compra y asignamos las marcas
    if (boleta) {
      try {
        const pResult = db.prepare(`
          INSERT INTO purchases (customer_id, branch_id, receipt_number, amount, created_by_staff_id)
          VALUES (?,?,?,?,?)
        `).run(customerId, 1, String(boleta), 0, null);
        for (let i = 0; i < numMarcas; i++) {
          db.prepare(`INSERT INTO stamp_events (loyalty_card_id, purchase_id, staff_id, branch_id, type)
                      VALUES (?,?,?,?,'grant')`).run(cardId, Number(pResult.lastInsertRowid), null, 1);
        }
      } catch (e) { /* boleta duplicada, se ignora */ }
    }

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
  if (!staff || staff.role !== 'admin') {
    sendJSON(res, 401, { error: 'Debes iniciar sesión como administrador.' });
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
    SELECT c.id, c.rut, c.first_name, c.last_name, c.birth_date, c.email, c.whatsapp_number,
           lc.id as card_id, lc.unique_token, lc.short_code, lc.current_stamps, lc.required_stamps, lc.status,
           (SELECT COUNT(*) FROM stamp_events se WHERE se.loyalty_card_id = lc.id AND se.type = 'grant') as lifetime_stamps,
           (SELECT COUNT(*) FROM reward_redemptions rr WHERE rr.loyalty_card_id = lc.id) as lifetime_redemptions,
           (SELECT COUNT(*) FROM purchases p WHERE p.customer_id = c.id) as lifetime_purchases
    FROM customers c
    LEFT JOIN (
      SELECT lc.*, lp.required_stamps FROM loyalty_cards lc JOIN loyalty_programs lp ON lp.id = lc.program_id
    ) lc ON lc.customer_id = c.id
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
    first_name: first_name ?? customer.first_name,
    last_name: last_name ?? customer.last_name,
    birth_date: birth_date ?? customer.birth_date,
    email: email ?? customer.email,
    whatsapp_number: whatsapp_number ?? customer.whatsapp_number
  };

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

  const cleanRut = decodeURIComponent(rut).trim().toUpperCase();
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

  const cleanRut = rut.trim().toUpperCase();
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
  if (!staff || staff.role !== 'admin') {
    return renderLoginPage(res, '/admin', 'Acceso de administrador');
  }
  const programs = db.prepare('SELECT * FROM loyalty_programs').all();
  const stats = getDashboardStats();
  const analytics = getSalesAnalytics();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin - Diseño de tarjeta</title>
<script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"></script>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#f4f4f5;margin:0;padding:20px;}
  .wrap{max-width:900px;margin:0 auto;}
  .panel{display:flex;gap:24px;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.1);margin-bottom:20px;flex-wrap:wrap;}
  .formcol{flex:1;min-width:280px;}
  .previewcol{width:280px;display:flex;flex-direction:column;align-items:center;}
  label{display:block;font-size:13px;font-weight:600;margin-top:14px;margin-bottom:4px;color:#333;}
  input[type=text],input[type=number],input[type=url]{width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px;}
  button{margin-top:18px;width:100%;padding:10px;background:#16321f;color:#fff;border:none;border-radius:6px;font-size:15px;cursor:pointer;}
  h2{margin-top:0;}
  .msg{font-size:13px;margin-top:10px;color:#16321f;}
  .colorrow{display:flex;gap:8px;align-items:center;margin-top:4px;}
  .colorrow input[type=color]{width:42px;height:36px;padding:2px;border:1px solid #ccc;border-radius:6px;cursor:pointer;}
  .colorrow input[type=text]{flex:1;}
  .iconbtn{width:36px;height:36px;min-width:36px;margin-top:0;font-size:18px;border:1px solid #ccc;border-radius:6px;background:#fafafa;cursor:pointer;padding:0;line-height:1;color:#333;}
  .iconbtn.active{border-color:#16321f;border-width:2px;background:#eef4ef;}
  .iconrow{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
  .rangerow{display:flex;align-items:center;gap:10px;margin-top:4px;}
  .rangerow input[type=range]{flex:1;}
  .rangeval{font-size:13px;color:#666;width:50px;text-align:right;}
  .preview-card{width:240px;border-radius:16px;padding:18px 14px;box-sizing:border-box;text-align:center;color:#fff;transition:background 0.15s;overflow:hidden;}
  .preview-card img{display:block;margin:0 auto 10px;object-fit:contain;}
  .preview-brand{font-size:15px;font-weight:700;margin-bottom:2px;}
  .preview-name{font-size:12px;opacity:0.85;margin-bottom:10px;}
  .preview-qr{background:#fff;border-radius:8px;width:100px;height:100px;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:10px;}
  .preview-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:8px;}
  .preview-stamp{aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,0.18);border:1.5px dashed rgba(255,255,255,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;color:#fff;}
  .preview-stamp.filled{border:1.5px solid transparent;}
  .preview-label{font-size:11px;color:#999;margin-top:8px;}
  .topbar{max-width:900px;margin:0 auto 14px;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#555;}
  .topbar .actions{display:flex;gap:8px;}
  .topbar button{width:auto;margin:0;padding:7px 14px;background:#888;font-size:12px;}
</style></head>
<body>
<div class="topbar">
  <span>Sesión: ${staff.name} (administrador)</span>
  <div class="actions">
    <button onclick="window.location.href='/caja'">Ir a caja</button>
    <button onclick="logout()">Cerrar sesión</button>
  </div>
</div>
<div class="wrap">
<div class="admintabs" style="display:flex;gap:8px;margin-bottom:18px;">
  <button type="button" class="admintabbtn active" id="tabBtnDashboard" onclick="switchAdminTab('dashboard')" style="width:auto;margin:0;padding:10px 20px;background:#16321f;color:#fff;">Dashboard</button>
  <button type="button" class="admintabbtn" id="tabBtnClientes" onclick="switchAdminTab('clientes')" style="width:auto;margin:0;padding:10px 20px;background:#ddd;color:#333;">Clientes</button>
  <button type="button" class="admintabbtn" id="tabBtnDiseno" onclick="switchAdminTab('diseno')" style="width:auto;margin:0;padding:10px 20px;background:#ddd;color:#333;">Diseño de tarjeta</button>
</div>

<div class="panel" id="tabContentDashboard" style="display:block;">
  <h2>Dashboard de análisis</h2>

  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
    <button type="button" onclick="downloadExcel()" style="width:auto;background:#0D8063;">⬇ Descargar Excel completo</button>
    <button type="button" onclick="window.location.href='/api/admin/download-db'" style="width:auto;background:#16321f;">⬇ Descargar base de datos (.db)</button>
    <label style="width:auto;display:inline-flex;align-items:center;padding:10px 16px;background:#444;color:#fff;border-radius:6px;cursor:pointer;font-size:14px;margin-top:18px;">
      ⬆ Cargar registro de clientes (Excel)
      <input type="file" id="fileRegistry" accept=".xlsx,.xls" style="display:none;" onchange="importRegistryFile(this)">
    </label>
    <label style="width:auto;display:inline-flex;align-items:center;padding:10px 16px;background:#444;color:#fff;border-radius:6px;cursor:pointer;font-size:14px;margin-top:18px;">
      ⬆ Cargar reporte de ventas (DTR-MOV)
      <input type="file" id="fileSales" accept=".xlsx,.xls" style="display:none;" onchange="importSalesFile(this)">
    </label>
    <button type="button" onclick="clearSalesData()" style="width:auto;background:#a01818;margin-top:18px;">🗑 Borrar ventas cargadas</button>
    <button type="button" onclick="clearRegistryData()" style="width:auto;background:#a01818;margin-top:18px;">🗑 Borrar registro de clientes</button>
  </div>
  <div id="importMsg" style="font-size:13px;margin-bottom:14px;"></div>

  <div id="registryWrap" style="display:none;margin-bottom:28px;">
    <h3>Registro de clientes (tal como tu planilla)</h3>
    <div style="overflow-x:auto;max-height:400px;overflow-y:auto;border:1px solid #eee;border-radius:8px;">
      <table style="width:100%;min-width:760px;border-collapse:collapse;font-size:13px;">
        <thead style="position:sticky;top:0;background:#16321f;color:#fff;">
          <tr>
            <th style="padding:8px;text-align:left;">RUT</th>
            <th style="padding:8px;text-align:left;">Nombre</th>
            <th style="padding:8px;text-align:left;">FechaNac</th>
            <th style="padding:8px;text-align:left;">Correo</th>
            <th style="padding:8px;text-align:left;">Boleta</th>
            <th style="padding:8px;text-align:left;">Stickers</th>
            <th style="padding:8px;text-align:left;">DÍA</th>
            <th style="padding:8px;text-align:left;">MES</th>
          </tr>
        </thead>
        <tbody id="registryBody"></tbody>
      </table>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-top:10px;">
    <div style="background:#f7f7f7;border-radius:10px;padding:16px;">
      <div style="font-size:13px;color:#777;">Clientes fidelizados</div>
      <div style="font-size:28px;font-weight:700;color:#16321f;">${stats.customers}</div>
    </div>
    <div style="background:#f7f7f7;border-radius:10px;padding:16px;">
      <div style="font-size:13px;color:#777;">Tarjetas activas</div>
      <div style="font-size:28px;font-weight:700;color:#16321f;">${stats.activeCards}</div>
    </div>
    <div style="background:#f7f7f7;border-radius:10px;padding:16px;">
      <div style="font-size:13px;color:#777;">Tarjetas completadas</div>
      <div style="font-size:28px;font-weight:700;color:#16321f;">${stats.completedCards}</div>
    </div>
    <div style="background:#f7f7f7;border-radius:10px;padding:16px;">
      <div style="font-size:13px;color:#777;">Premios canjeados</div>
      <div style="font-size:28px;font-weight:700;color:#16321f;">${stats.redemptions}</div>
    </div>
    <div style="background:#fff3e0;border-radius:10px;padding:16px;">
      <div style="font-size:13px;color:#a05a00;">Total $ vendido a fidelizados</div>
      <div style="font-size:24px;font-weight:700;color:#a05a00;">$${Math.round(analytics.totalSold).toLocaleString('es-CL')}</div>
    </div>
    <div style="background:#fff3e0;border-radius:10px;padding:16px;">
      <div style="font-size:13px;color:#a05a00;">Ticket promedio</div>
      <div style="font-size:24px;font-weight:700;color:#a05a00;">$${Math.round(analytics.ticketPromedio).toLocaleString('es-CL')}</div>
    </div>
  </div>

  ${analytics.totalSalesRows === 0 ? `
  <div style="margin-top:20px;padding:14px;background:#fdf6e3;border-radius:8px;font-size:13px;color:#7a5a00;">
    Aún no has cargado tu reporte de ventas (DTR-MOV). Los datos de $ vendido, productos y horarios aparecerán aquí una vez que lo cargues con el botón de arriba.
  </div>` : `
  <div style="margin-top:20px;padding:10px 14px;background:#eef4ef;border-radius:8px;font-size:12px;color:#16321f;">
    ${analytics.totalRegistryRows} registros de clientes cargados · ${analytics.totalSalesRows} filas de venta cargadas · ${analytics.matchedRows} cruzaron por N° de documento.
  </div>`}

  <h3 style="margin-top:28px;">Clientes con más compras ($ gastado real, según DTR-MOV)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="text-align:left;border-bottom:2px solid #eee;">
      <th style="padding:8px;">RUT</th><th style="padding:8px;">Nombre</th><th style="padding:8px;">N° Boletas</th><th style="padding:8px;">Total $</th>
    </tr></thead>
    <tbody>
      ${analytics.perClient.filter(c => c.total_comprado > 0).slice(0, 15).map(c => `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px;">${c.rut}</td><td style="padding:8px;">${c.nombre || ''}</td><td style="padding:8px;">${c.boletas}</td><td style="padding:8px;">$${Math.round(c.total_comprado).toLocaleString('es-CL')}</td></tr>`).join('') || '<tr><td colspan="4" style="padding:8px;color:#999;">Sin datos de venta cargados todavía.</td></tr>'}
    </tbody>
  </table>

  <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:28px;">
    <div style="flex:1;min-width:280px;">
      <h3>Productos más vendidos</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="text-align:left;border-bottom:2px solid #eee;"><th style="padding:6px;">Producto</th><th style="padding:6px;">Cant.</th></tr></thead>
        <tbody>${analytics.topProducts.map(p => `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px;">${p.producto}</td><td style="padding:6px;">${p.cantidad_total}</td></tr>`).join('') || '<tr><td colspan="2" style="padding:6px;color:#999;">Sin datos.</td></tr>'}</tbody>
      </table>
    </div>
    <div style="flex:1;min-width:280px;">
      <h3>Productos menos vendidos</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="text-align:left;border-bottom:2px solid #eee;"><th style="padding:6px;">Producto</th><th style="padding:6px;">Cant.</th></tr></thead>
        <tbody>${analytics.bottomProducts.map(p => `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px;">${p.producto}</td><td style="padding:6px;">${p.cantidad_total}</td></tr>`).join('') || '<tr><td colspan="2" style="padding:6px;color:#999;">Sin datos.</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:28px;">
    <div style="flex:1;min-width:280px;">
      <h3>Ranking de cajeros (clientes fidelizados)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="text-align:left;border-bottom:2px solid #eee;"><th style="padding:6px;">Cajero</th><th style="padding:6px;">Clientes fidelizados</th></tr></thead>
        <tbody>${analytics.cashierRanking.map(c => `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px;">${c.cajero}</td><td style="padding:6px;">${c.clientes_fidelizados}</td></tr>`).join('') || '<tr><td colspan="2" style="padding:6px;color:#999;">Sin datos (carga la base de clientes con columna Cajero).</td></tr>'}</tbody>
      </table>
    </div>
    <div style="flex:1;min-width:280px;">
      <h3>Mejores horarios de compra</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="text-align:left;border-bottom:2px solid #eee;"><th style="padding:6px;">Hora</th><th style="padding:6px;">Transacciones</th><th style="padding:6px;">Total $</th></tr></thead>
        <tbody>${analytics.hourBrackets.map(h => `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px;">${h.hora_del_dia}:00</td><td style="padding:6px;">${h.transacciones}</td><td style="padding:6px;">$${Math.round(h.monto).toLocaleString('es-CL')}</td></tr>`).join('') || '<tr><td colspan="3" style="padding:6px;color:#999;">Sin datos.</td></tr>'}</tbody>
      </table>
    </div>
  </div>
</div>

<div id="tabContentDiseno" style="display:none;">
${programs.map(p => {
  const icons = ['★','✦','✱','✓','✪'];
  return `
<div class="panel" id="panel-${p.id}">
  <div class="formcol">
    <h2>${p.name} (id ${p.id})</h2>
    <form onsubmit="return saveProgram(event, ${p.id})" oninput="updatePreview(${p.id})">
      <label>Nombre del programa</label>
      <input type="text" name="name" value="${p.name}">

      <label>Cantidad de marcas requeridas</label>
      <input type="number" name="required_stamps" min="1" max="30" value="${p.required_stamps}">

      <label>URL del logo (o pega un código data:image/...)</label>
      <input type="text" name="logo_url" value="${p.logo_url || ''}" placeholder="https://.../logo.png">

      <label>Tamaño del logo (máximo 140px)</label>
      <div class="rangerow">
        <input type="range" name="logo_width" min="50" max="140" value="${Math.min(p.logo_width || 140, 140)}" oninput="document.getElementById('logo-width-val-${p.id}').textContent=this.value+'px'">
        <span class="rangeval" id="logo-width-val-${p.id}">${Math.min(p.logo_width || 140, 140)}px</span>
      </div>

      <label>Color principal</label>
      <div class="colorrow">
        <input type="color" name="primary_color_picker" value="${p.primary_color}" oninput="syncColor(${p.id},'primary_color',this.value)">
        <input type="text" name="primary_color" value="${p.primary_color}" placeholder="#0D8063" oninput="syncColorFromText(${p.id},'primary_color',this.value)">
      </div>

      <label>Color secundario</label>
      <div class="colorrow">
        <input type="color" name="secondary_color_picker" value="${p.secondary_color}" oninput="syncColor(${p.id},'secondary_color',this.value)">
        <input type="text" name="secondary_color" value="${p.secondary_color}" placeholder="#EC8626" oninput="syncColorFromText(${p.id},'secondary_color',this.value)">
      </div>

      <label>Ícono de marca</label>
      <input type="text" name="stamp_icon" id="stamp-icon-${p.id}" value="${p.stamp_icon}" oninput="markActiveIcon(${p.id})">
      <div class="iconrow" id="iconrow-${p.id}">
        ${icons.map(icon =>
          `<button type="button" class="iconbtn${icon === p.stamp_icon ? ' active' : ''}" data-icon="${icon}" onclick="chooseIcon(${p.id}, this)">${icon}</button>`
        ).join('')}
      </div>

      <label>Color de fondo del ícono (marca completada)</label>
      <div class="colorrow">
        <input type="color" name="stamp_color_picker" value="${p.stamp_color || '#d62828'}" oninput="syncColor(${p.id},'stamp_color',this.value)">
        <input type="text" name="stamp_color" value="${p.stamp_color || '#d62828'}" placeholder="#d62828" oninput="syncColorFromText(${p.id},'stamp_color',this.value)">
      </div>

      <label>Tamaño del ícono (máximo 25px)</label>
      <div class="rangerow">
        <input type="range" name="stamp_size" min="10" max="25" value="${Math.min(p.stamp_size || 22, 25)}" oninput="document.getElementById('stamp-size-val-${p.id}').textContent=this.value+'px'">
        <span class="rangeval" id="stamp-size-val-${p.id}">${Math.min(p.stamp_size || 22, 25)}px</span>
      </div>

      <button type="submit">Guardar diseño</button>
      <div class="msg" id="msg-${p.id}"></div>
    </form>
  </div>

  <div class="previewcol">
    <div class="preview-card" id="preview-card-${p.id}" style="background:${p.primary_color};">
      <img id="preview-logo-${p.id}" src="${p.logo_url || ''}" style="width:min(${p.logo_width || 200}px, 80%);max-height:75px;height:auto;display:${p.logo_url ? 'block' : 'none'};">
      <div class="preview-brand" id="preview-brand-${p.id}">${p.name}</div>
      <div class="preview-name">Nombre Apellido</div>
      <div class="preview-qr">QR</div>
      <div class="preview-grid" id="preview-grid-${p.id}"></div>
      <div style="font-size:11px;opacity:0.8;">VISITAS: 0 / ${p.required_stamps}</div>
    </div>
    <div class="preview-label">Vista previa en vivo</div>
  </div>
</div>`;
}).join('')}
</div>

<div class="panel" id="tabContentClientes" style="display:none;">
  <h2>Clientes registrados</h2>
  <button type="button" onclick="toggleAddCustomer()" style="width:auto;">+ Agregar cliente</button>

  <div id="addCustomerForm" style="display:none;margin-top:16px;padding:16px;background:#fafafa;border-radius:8px;">
    <label>RUT</label>
    <input type="text" id="newRut" placeholder="12345678-5">
    <label>Nombre</label>
    <input type="text" id="newFirstName">
    <label>Apellido</label>
    <input type="text" id="newLastName">
    <label>Fecha de nacimiento</label>
    <input type="date" id="newBirthDate">
    <label>Correo</label>
    <input type="text" id="newEmail">
    <label>WhatsApp (opcional)</label>
    <input type="text" id="newWhatsapp" placeholder="+56912345678">
    <button type="button" onclick="createCustomer()">Guardar cliente</button>
    <div class="msg" id="addCustomerMsg"></div>
  </div>

  <div style="overflow-x:auto;margin-top:18px;">
  <table id="customersTable" style="width:100%;min-width:760px;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="text-align:left;border-bottom:2px solid #eee;">
        <th style="padding:10px 8px;white-space:nowrap;">RUT</th>
        <th style="padding:10px 8px;white-space:nowrap;">Nombre</th>
        <th style="padding:10px 8px;white-space:nowrap;">Correo</th>
        <th style="padding:10px 8px;white-space:nowrap;">Marcas</th>
        <th style="padding:10px 8px;white-space:nowrap;">Compras</th>
        <th style="padding:10px 8px;white-space:nowrap;">Premios</th>
        <th style="padding:10px 8px;white-space:nowrap;">Estado</th>
        <th style="padding:10px 8px;white-space:nowrap;">Acciones</th>
      </tr>
    </thead>
    <tbody id="customersBody"></tbody>
  </table>
  </div>
  <div id="customerDetailPanel" style="display:none;margin-top:20px;border-top:2px solid #eee;padding-top:16px;"></div>
</div>

</div>
<script>
async function clearSalesData() {
  if (!confirm('¿Borrar todos los datos de ventas cargados? Esto no afecta a los clientes ni sus marcas, solo el detalle de ventas para análisis.')) return;
  const r = await fetch('/api/admin/sales-detail', { method: 'DELETE' });
  if (r.ok) { window.location.reload(); } else { alert('Error al borrar.'); }
}

// ---------- Excel: exportar (descarga) ----------
async function downloadExcel() {
  const msg = document.getElementById('importMsg');
  msg.textContent = 'Generando Excel...';
  msg.style.color = '#555';
  try {
    const r = await fetch('/api/admin/all-data');
    if (r.status === 401) { window.location.href = '/admin'; return; }
    const data = await r.json();

    const wb = XLSX.utils.book_new();
    const summary = [
      ['Resumen del sistema de fidelización'],
      ['Generado:', new Date().toLocaleString('es-CL')],
      [],
      ['Clientes fidelizados', data.stats.customers],
      ['Tarjetas activas', data.stats.activeCards],
      ['Tarjetas completadas', data.stats.completedCards],
      ['Premios canjeados', data.stats.redemptions],
      ['Total $ vendido a fidelizados', Math.round(data.analytics.totalSold)],
      ['Ticket promedio', Math.round(data.analytics.ticketPromedio)]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Resumen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.customers), 'Clientes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.purchases), 'Compras');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.stampEvents), 'Marcas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.redemptions), 'Premios canjeados');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.salesDetail), 'Ventas DTR-MOV');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.analytics.perClient), 'Análisis por cliente');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.analytics.topProducts), 'Top productos');

    XLSX.writeFile(wb, 'fidelizacion-' + new Date().toISOString().slice(0,10) + '.xlsx');
    msg.textContent = 'Excel descargado ✓';
    msg.style.color = '#16321f';
  } catch (err) {
    msg.textContent = 'Error al generar el Excel: ' + err.message;
    msg.style.color = '#a01818';
  }
}

// Busca la fila de encabezados dentro de una hoja (las primeras filas pueden ser títulos)
function findHeaderRow(rows, mustContain) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowText = (rows[i] || []).map(c => String(c || '').toLowerCase().trim());
    if (mustContain.every(key => rowText.some(cell => cell.includes(key)))) return i;
  }
  return -1;
}
function colIndex(headerRow, ...names) {
  const norm = headerRow.map(h => String(h || '').toLowerCase().trim());
  // 1) Coincidencia exacta primero (evita confundir "costo total bruto" con "Total Bruto")
  for (const name of names) {
    const idx = norm.findIndex(h => h === name);
    if (idx !== -1) return idx;
  }
  // 2) Si no hay exacta, busca que contenga el texto pero descarta columnas de "costo"
  for (const name of names) {
    const idx = norm.findIndex(h => h.includes(name) && !h.includes('costo'));
    if (idx !== -1) return idx;
  }
  // 3) Último recurso: cualquier columna que contenga el texto
  for (const name of names) {
    const idx = norm.findIndex(h => h.includes(name));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ---------- Excel: importar base de clientes ----------
function importRegistryFile(input) {
  const file = input.files[0];
  if (!file) return;
  const msg = document.getElementById('importMsg');
  msg.textContent = 'Leyendo archivo...';
  msg.style.color = '#555';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
      const headerIdx = findHeaderRow(rows, ['rut']);
      if (headerIdx === -1) { msg.textContent = 'No se encontró la fila de encabezados (RUT, Nombre, etc).'; msg.style.color = '#a01818'; return; }
      const header = rows[headerIdx];
      const cRut = colIndex(header, 'rut');
      const cNombre = colIndex(header, 'nombre');
      const cFecha = colIndex(header, 'fechanac', 'fecha nac');
      const cCorreo = colIndex(header, 'correo');
      const cBoleta = colIndex(header, 'boleta');
      const cStickers = colIndex(header, 'sticker');
      const cDia = colIndex(header, 'día', 'dia');
      const cMes = colIndex(header, 'mes');
      const cCajero = colIndex(header, 'cajero');

      const parsed = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[cRut]) continue;
        parsed.push({
          rut: r[cRut],
          nombre: r[cNombre] || '',
          fechaNac: r[cFecha] || null,
          correo: r[cCorreo] || '',
          boleta: r[cBoleta] || null,
          stickers: cStickers !== -1 ? parseInt(r[cStickers], 10) || 0 : 0,
          dia: cDia !== -1 ? parseInt(r[cDia], 10) : null,
          mes: cMes !== -1 ? parseInt(r[cMes], 10) : null,
          cajero: cCajero !== -1 ? (r[cCajero] || null) : null
        });
      }

      msg.textContent = 'Importando ' + parsed.length + ' registros (una fila por cada uno, sin combinar)...';
      const resp = await fetch('/api/admin/import-registry', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rows: parsed }) });
      const result = await resp.json();
      if (resp.ok) {
        msg.textContent = '✓ ' + result.inserted + ' registros cargados.';
        msg.style.color = '#16321f';
        loadRegistry();
        setTimeout(() => window.location.reload(), 600);
      } else {
        msg.textContent = result.error || 'Error al importar.';
        msg.style.color = '#a01818';
      }
    } catch (err) {
      msg.textContent = 'Error leyendo el Excel: ' + err.message;
      msg.style.color = '#a01818';
    }
  };
  reader.readAsArrayBuffer(file);
  input.value = '';
}

async function loadRegistry() {
  const r = await fetch('/api/admin/registry');
  if (r.status === 401) return;
  const rows = await r.json();
  const wrap = document.getElementById('registryWrap');
  const tbody = document.getElementById('registryBody');
  if (rows.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  tbody.innerHTML = rows.map(row =>
    '<tr style="border-bottom:1px solid #f0f0f0;">' +
      '<td style="padding:6px 8px;">' + (row.rut || '') + '</td>' +
      '<td style="padding:6px 8px;">' + (row.nombre || '') + '</td>' +
      '<td style="padding:6px 8px;">' + (row.fecha_nac || '') + '</td>' +
      '<td style="padding:6px 8px;">' + (row.correo || '') + '</td>' +
      '<td style="padding:6px 8px;">' + (row.boleta || '') + '</td>' +
      '<td style="padding:6px 8px;">' + (row.stickers != null ? row.stickers : '') + '</td>' +
      '<td style="padding:6px 8px;">' + (row.dia != null ? row.dia : '') + '</td>' +
      '<td style="padding:6px 8px;">' + (row.mes != null ? row.mes : '') + '</td>' +
    '</tr>'
  ).join('');
}

async function clearRegistryData() {
  if (!confirm('¿Borrar todo el registro de clientes cargado? Esto no afecta tus clientes activos del sistema (registro/caja), solo este reporte.')) return;
  const r = await fetch('/api/admin/registry', { method: 'DELETE' });
  if (r.ok) { window.location.reload(); } else { alert('Error al borrar.'); }
}

loadRegistry();

// ---------- Excel: importar reporte de ventas (DTR-MOV) ----------
function importSalesFile(input) {
  const file = input.files[0];
  if (!file) return;
  const msg = document.getElementById('importMsg');
  msg.textContent = 'Leyendo archivo de ventas (puede tardar si es grande)...';
  msg.style.color = '#555';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true, cellText: false });
      const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('dtr')) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      const headerIdx = findHeaderRow(rows, ['rut', 'documento']);
      if (headerIdx === -1) { msg.textContent = 'No se encontró la fila de encabezados (rut, documento, etc).'; msg.style.color = '#a01818'; return; }
      const header = rows[headerIdx];
      const cRut = colIndex(header, 'rut');
      const cDoc = colIndex(header, 'documento');
      const cFecha = colIndex(header, 'fecha');
      const cHora = colIndex(header, 'hora');
      const cCajero = colIndex(header, 'nombre usuario');
      const cProducto = colIndex(header, 'nombre');
      const cGrupo = colIndex(header, 'grupo');
      const cCantidad = colIndex(header, 'cant.sal', 'cant sal');
      const cNeto = colIndex(header, 'total neto');
      const cBruto = colIndex(header, 'total bruto');

      const toStr = (v) => {
        if (v == null) return null;
        if (v instanceof Date) return v.toISOString().slice(0,10);
        return String(v).trim();
      };

      const parsed = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[cDoc] == null) continue;
        parsed.push({
          rut: toStr(r[cRut]),
          documento: toStr(r[cDoc]),
          fecha: toStr(r[cFecha]),
          hora: toStr(r[cHora]),
          cajero: toStr(r[cCajero]),
          producto: toStr(r[cProducto]),
          grupo: toStr(r[cGrupo]),
          cantidad: parseFloat(r[cCantidad]) || 0,
          totalNeto: parseFloat(r[cNeto]) || 0,
          totalBruto: parseFloat(r[cBruto]) || 0
        });
      }

      msg.textContent = 'Importando ' + parsed.length + ' filas de venta (esto puede tardar)...';
      // Se envía en lotes para no saturar el servidor con archivos muy grandes
      const chunkSize = 2000;
      let totalInserted = 0;
      for (let i = 0; i < parsed.length; i += chunkSize) {
        const chunk = parsed.slice(i, i + chunkSize);
        const resp = await fetch('/api/admin/import-sales', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rows: chunk }) });
        const result = await resp.json();
        if (!resp.ok) { msg.textContent = result.error || 'Error al importar ventas.'; msg.style.color = '#a01818'; return; }
        totalInserted += result.inserted;
        msg.textContent = 'Importando... ' + totalInserted + '/' + parsed.length;
      }
      msg.textContent = '✓ ' + totalInserted + ' filas de venta importadas. Recargando dashboard...';
      msg.style.color = '#16321f';
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      msg.textContent = 'Error leyendo el Excel: ' + err.message;
      msg.style.color = '#a01818';
    }
  };
  reader.readAsArrayBuffer(file);
  input.value = '';
}

function switchAdminTab(tab) {
  const tabs = ['dashboard', 'clientes', 'diseno'];
  tabs.forEach(t => {
    const content = document.getElementById('tabContent' + t.charAt(0).toUpperCase() + t.slice(1));
    const btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
    const active = t === tab;
    if (content) content.style.display = active ? 'block' : 'none';
    if (btn) {
      btn.style.background = active ? '#16321f' : '#ddd';
      btn.style.color = active ? '#fff' : '#333';
    }
  });
  if (tab === 'clientes') loadCustomers();
}

const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

async function showCustomerDetail(id) {
  const panel = document.getElementById('customerDetailPanel');
  panel.style.display = 'block';
  panel.innerHTML = '<p style="color:#888;">Cargando detalle...</p>';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const r = await fetch('/api/admin/customers/' + id + '/detail');
  if (r.status === 401) { window.location.href = '/admin'; return; }
  const d = await r.json();
  if (!r.ok) { panel.innerHTML = '<p style="color:#a01818;">' + (d.error || 'Error') + '</p>'; return; }

  const purchasesHtml = d.purchases.map(p =>
    '<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px;">' + p.documento + '</td><td style="padding:6px;">' + (p.fecha || (p.purchase_date || '').slice(0,10)) + '</td><td style="padding:6px;">' + (p.hora || '—') + '</td><td style="padding:6px;">$' + Math.round(p.monto).toLocaleString('es-CL') + '</td></tr>'
  ).join('') || '<tr><td colspan="4" style="padding:6px;color:#999;">Sin boletas registradas.</td></tr>';

  const productsHtml = d.topProducts.map(p =>
    '<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px;">' + p.producto + '</td><td style="padding:6px;">' + p.cantidad + '</td></tr>'
  ).join('') || '<tr><td colspan="2" style="padding:6px;color:#999;">Sin datos de venta cruzados para este cliente.</td></tr>';

  const bestHour = d.hourPattern[0] ? d.hourPattern[0].hora_del_dia + ':00 (' + d.hourPattern[0].veces + ' veces)' : 'Sin datos';
  const bestDay = d.dayPattern[0] ? DAY_NAMES[d.dayPattern[0].dow] + ' (' + d.dayPattern[0].veces + ' veces)' : 'Sin datos';

  panel.innerHTML = '<h3>Detalle: ' + d.customer.first_name + ' ' + d.customer.last_name + ' (' + d.customer.rut + ')</h3>' +
    '<button type="button" onclick="document.getElementById(\\'customerDetailPanel\\').style.display=\\'none\\'" style="width:auto;background:#888;margin-bottom:14px;">Cerrar detalle</button>' +
    '<div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px;">' +
      '<div style="background:#f7f7f7;border-radius:8px;padding:12px 16px;"><div style="font-size:12px;color:#777;">Horario preferido</div><div style="font-size:16px;font-weight:700;color:#16321f;">' + bestHour + '</div></div>' +
      '<div style="background:#f7f7f7;border-radius:8px;padding:12px 16px;"><div style="font-size:12px;color:#777;">Día preferido</div><div style="font-size:16px;font-weight:700;color:#16321f;">' + bestDay + '</div></div>' +
    '</div>' +
    '<div style="display:flex;gap:24px;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:300px;"><h4>Boletas (N° de boleta)</h4><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;border-bottom:2px solid #eee;"><th style="padding:6px;">Boleta</th><th style="padding:6px;">Fecha</th><th style="padding:6px;">Hora</th><th style="padding:6px;">Monto</th></tr></thead><tbody>' + purchasesHtml + '</tbody></table></div>' +
      '<div style="flex:1;min-width:260px;"><h4>Productos que más compra</h4><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;border-bottom:2px solid #eee;"><th style="padding:6px;">Producto</th><th style="padding:6px;">Cant.</th></tr></thead><tbody>' + productsHtml + '</tbody></table></div>' +
    '</div>';
}

function toggleAddCustomer() {
  const f = document.getElementById('addCustomerForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function loadCustomers() {
  const r = await fetch('/api/admin/customers');
  if (r.status === 401) { window.location.href = '/admin'; return; }
  const rows = await r.json();
  const tbody = document.getElementById('customersBody');
  tbody.innerHTML = rows.map(c => \`
    <tr style="border-bottom:1px solid #f0f0f0;" id="row-\${c.id}">
      <td style="padding:8px;">\${c.rut}</td>
      <td style="padding:8px;">\${c.first_name} \${c.last_name}</td>
      <td style="padding:8px;">\${c.email || ''}</td>
      <td style="padding:8px;">\${c.current_stamps != null ? c.current_stamps + '/' + c.required_stamps : '—'}</td>
      <td style="padding:8px;">\${c.lifetime_purchases || 0}</td>
      <td style="padding:8px;">\${c.lifetime_redemptions || 0}</td>
      <td style="padding:8px;">\${c.status || '—'}</td>
      <td style="padding:10px 8px;white-space:nowrap;">
        <button type="button" style="width:auto;margin:0 4px 4px 0;padding:5px 8px;font-size:12px;background:#0D8063;" onclick="showCustomerDetail(\${c.id})">Detalle</button>
        <button type="button" style="width:auto;margin:0 4px 4px 0;padding:5px 8px;font-size:12px;" onclick="editCustomer(\${c.id})">Editar</button>
        <button type="button" style="width:auto;margin:0 4px 4px 0;padding:5px 8px;font-size:12px;background:#888;" onclick="purchaseFor(\${c.id}, '\${c.unique_token || ''}')">Boleta</button>
        <button type="button" style="width:auto;margin:0 0 4px 0;padding:5px 8px;font-size:12px;background:#a01818;" onclick="deleteCustomer(\${c.id})">Eliminar</button>
      </td>
    </tr>
  \`).join('');
}

async function createCustomer() {
  const body = {
    rut: document.getElementById('newRut').value.trim(),
    first_name: document.getElementById('newFirstName').value.trim(),
    last_name: document.getElementById('newLastName').value.trim(),
    birth_date: document.getElementById('newBirthDate').value,
    email: document.getElementById('newEmail').value.trim(),
    whatsapp_number: document.getElementById('newWhatsapp').value.trim() || undefined
  };
  const r = await fetch('/api/customers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await r.json();
  const msg = document.getElementById('addCustomerMsg');
  if (r.ok) {
    msg.textContent = 'Cliente creado ✓';
    msg.style.color = '#16321f';
    loadCustomers();
  } else {
    msg.textContent = data.error || 'Error';
    msg.style.color = '#a01818';
  }
}

async function editCustomer(id) {
  const newFirst = prompt('Nuevo nombre (deja vacío para no cambiar):');
  const newLast = prompt('Nuevo apellido (deja vacío para no cambiar):');
  const newEmail = prompt('Nuevo correo (deja vacío para no cambiar):');
  const newWhatsapp = prompt('Nuevo WhatsApp (deja vacío para no cambiar):');
  const body = {};
  if (newFirst) body.first_name = newFirst;
  if (newLast) body.last_name = newLast;
  if (newEmail) body.email = newEmail;
  if (newWhatsapp) body.whatsapp_number = newWhatsapp;
  if (Object.keys(body).length === 0) return;
  const r = await fetch('/api/admin/customers/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await r.json();
  if (r.ok) loadCustomers(); else alert(data.error || 'Error al editar');
}

async function deleteCustomer(id) {
  if (!confirm('¿Eliminar este cliente y toda su información (tarjeta, marcas, compras)? Esta acción no se puede deshacer.')) return;
  const r = await fetch('/api/admin/customers/' + id, { method:'DELETE' });
  const data = await r.json();
  if (r.ok) loadCustomers(); else alert(data.error || 'Error al eliminar');
}

let boletaModalCtx = { customerId: null, token: null };

function purchaseFor(customerId, token) {
  if (!token) { alert('Este cliente no tiene tarjeta activa.'); return; }
  boletaModalCtx = { customerId, token };

  const overlay = document.createElement('div');
  overlay.id = 'boletaModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;box-sizing:border-box;';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:100%;box-sizing:border-box;">' +
      '<h3 style="margin-top:0;">Registrar boleta</h3>' +
      '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">N° de boleta</label>' +
      '<input type="text" id="boletaInput" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:15px;" autofocus>' +
      '<button type="button" onclick="lookupBoletaDetail()" style="width:100%;margin-top:10px;padding:10px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer;">Buscar boleta</button>' +
      '<div id="boletaLookupResult" style="margin-top:14px;font-size:13px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:18px;">' +
        '<button type="button" onclick="confirmBoleta()" style="flex:1;padding:10px;background:#16321f;color:#fff;border:none;border-radius:6px;cursor:pointer;">Confirmar y asignar marca</button>' +
        '<button type="button" onclick="closeBoletaModal()" style="flex:1;padding:10px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;">Cancelar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

function closeBoletaModal() {
  const el = document.getElementById('boletaModalOverlay');
  if (el) el.remove();
}

async function lookupBoletaDetail() {
  const documento = document.getElementById('boletaInput').value.trim();
  const resultDiv = document.getElementById('boletaLookupResult');
  if (!documento) { resultDiv.innerHTML = '<span style="color:#a01818;">Escribe un número de boleta.</span>'; return; }
  resultDiv.innerHTML = 'Buscando...';
  const r = await fetch('/api/admin/lookup-boleta/' + encodeURIComponent(documento));
  const data = await r.json();
  if (!r.ok) { resultDiv.innerHTML = '<span style="color:#a01818;">' + (data.error || 'Error') + '</span>'; return; }

  if (data.rows.length === 0) {
    resultDiv.innerHTML = '<span style="color:#a05a00;">No se encontró esta boleta en el reporte de ventas cargado. Igual puedes confirmarla manualmente si es correcta.</span>';
    return;
  }
  const productsHtml = data.rows.map(p => '<div>• ' + p.producto + ' (x' + p.cantidad + ')</div>').join('');
  const usedHtml = data.alreadyUsed ? '<div style="color:#a01818;margin-top:6px;">⚠ Esta boleta ya fue usada para asignar una marca antes.</div>' : '';
  resultDiv.innerHTML =
    '<div style="background:#f7f7f7;border-radius:8px;padding:10px;">' +
      '<div style="font-weight:600;margin-bottom:4px;">Productos en esta boleta:</div>' +
      productsHtml +
      '<div style="margin-top:6px;font-weight:600;">Total: $' + Math.round(data.total).toLocaleString('es-CL') + '</div>' +
      usedHtml +
    '</div>';
}

async function confirmBoleta() {
  const documento = document.getElementById('boletaInput').value.trim();
  if (!documento) { alert('Escribe un número de boleta.'); return; }
  const r = await fetch('/api/purchases', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_token: boletaModalCtx.token, branch_id: 1, receipt_number: documento })
  });
  const data = await r.json();
  if (r.ok) {
    closeBoletaModal();
    alert('Marca asignada. Ahora tiene ' + data.current_stamps + ' marcas.');
    loadCustomers();
  } else {
    document.getElementById('boletaLookupResult').innerHTML = '<span style="color:#a01818;">' + (data.error || 'Error al registrar la compra') + '</span>';
  }
}

loadCustomers();

function syncColor(id, field, hexVal) {
  document.querySelector('#panel-' + id + ' [name=' + field + ']:not([type=color])').value = hexVal;
  updatePreview(id);
}
function syncColorFromText(id, field, val) {
  let v = val.trim();
  if (v && !v.startsWith('#')) v = '#' + v;
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
    document.querySelector('#panel-' + id + ' [name=' + field + '_picker]').value = v;
  }
  updatePreview(id);
}
function chooseIcon(id, btn) {
  document.getElementById('stamp-icon-' + id).value = btn.dataset.icon;
  document.querySelectorAll('#iconrow-' + id + ' .iconbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updatePreview(id);
}
function markActiveIcon(id) {
  const val = document.getElementById('stamp-icon-' + id).value;
  document.querySelectorAll('#iconrow-' + id + ' .iconbtn').forEach(b => b.classList.toggle('active', b.dataset.icon === val));
  updatePreview(id);
}
function normalizeHex(v) {
  v = (v || '').trim();
  if (!v) return v;
  if (!v.startsWith('#')) v = '#' + v;
  return v;
}
function updatePreview(id) {
  const form = document.querySelector('#panel-' + id + ' form');
  const primary = normalizeHex(form.primary_color.value) || '#16321f';
  const stampColor = normalizeHex(form.stamp_color.value) || '#d62828';
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
  logoImg.style.maxHeight = '75px';
  logoImg.style.height = 'auto';

  document.getElementById('preview-brand-' + id).textContent = name;

  const grid = document.getElementById('preview-grid-' + id);
  grid.innerHTML = '';
  const showCount = Math.min(stamps, 15);
  for (let i = 0; i < showCount; i++) {
    const div = document.createElement('div');
    div.className = 'preview-stamp' + (i === 0 ? ' filled' : '');
    if (i === 0 && /^#[0-9A-Fa-f]{6}$/.test(stampColor)) {
      div.style.background = stampColor;
      div.style.borderColor = stampColor;
    }
    div.style.fontSize = Math.min(stampSize, 25) + 'px';
    div.textContent = i === 0 ? icon : '';
    grid.appendChild(div);
  }
}

${programs.map(p => `updatePreview(${p.id});`).join('\n')}

async function logout() {
  await fetch('/api/auth/logout', { method:'POST' });
  window.location.href = '/admin';
}

async function saveProgram(e, id) {
  e.preventDefault();
  const form = e.target;
  const body = {
    name: form.name.value,
    required_stamps: parseInt(form.required_stamps.value, 10),
    logo_url: form.logo_url.value,
    logo_width: parseInt(form.logo_width.value, 10),
    primary_color: normalizeHex(form.primary_color.value),
    secondary_color: normalizeHex(form.secondary_color.value),
    stamp_icon: document.getElementById('stamp-icon-' + id).value,
    stamp_color: normalizeHex(form.stamp_color.value),
    stamp_size: parseInt(form.stamp_size.value, 10)
  };
  const r = await fetch('/api/admin/programs/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await r.json();
  document.getElementById('msg-' + id).textContent = r.ok ? 'Guardado ✓' : (data.error || 'Error');
  return false;
}
</script>
</body></html>`);
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
  const cleanRut = rut.trim().toUpperCase();
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
  <input type="text" id="rutInput" placeholder="12345678-5" autofocus>
  <button onclick="buscar()">Ver mi tarjeta</button>
  <div class="err" id="errMsg"></div>
  <p class="hint">¿Aún no estás registrado? <a href="/registro" style="color:#16321f;">Regístrate aquí</a></p>
</div>
<script>
document.getElementById('rutInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') buscar();
});

async function buscar() {
  const rut = document.getElementById('rutInput').value.trim();
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
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Registrar cliente</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,system-ui,sans-serif;background:#f4f4f5;margin:0;padding:20px;}
  .panel{max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:24px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.1);}
  h2{margin-top:0;font-size:20px;}
  label{display:block;font-size:13px;font-weight:600;margin-top:14px;margin-bottom:4px;color:#333;}
  input{width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;}
  input:focus{outline:none;border-color:#16321f;}
  .hint{font-size:11px;color:#aaa;margin-top:3px;}
  button{margin-top:20px;width:100%;padding:13px;background:#16321f;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-weight:600;}
  .result{margin-top:16px;padding:14px;border-radius:8px;font-size:14px;display:none;}
  .ok{background:#e6f4ea;color:#16321f;display:block;}
  .err{background:#fdeaea;color:#a01818;display:block;}
  .card-link{margin-top:10px;word-break:break-all;}
  .card-link a{color:#16321f;font-weight:600;}
  .topbar{max-width:440px;margin:0 auto 12px;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#555;}
  .topbar a{color:#16321f;font-weight:600;text-decoration:none;font-size:13px;}
</style></head>
<body>
<div class="topbar">
  <span>Registro de cliente</span>
  <a href="/caja">← Volver a caja</a>
</div>
<div class="panel">
  <h2>Nuevo cliente</h2>
  <form id="form" autocomplete="off">
    <label>RUT</label>
    <input name="rut" placeholder="12345678-5" required autofocus>
    <div class="hint">Sin puntos, con guión. Ej: 12345678-5</div>

    <label>Nombre y Apellido</label>
    <input name="nombre_completo" placeholder="Juan Pérez" required>

    <label>Fecha de nacimiento</label>
    <input name="birth_date" type="date" required>

    <label>N° de Boleta</label>
    <input name="boleta" placeholder="9642630" required>
    <div class="hint">Número de la boleta de esta visita</div>

    <button type="submit">Registrar cliente</button>
  </form>
  <div id="result" class="result"></div>
</div>
<script>
document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const nombreCompleto = f.nombre_completo.value.trim();
  const partes = nombreCompleto.split(' ');
  const firstName = partes[0] || nombreCompleto;
  const lastName = partes.slice(1).join(' ') || '-';
  const boleta = f.boleta.value.trim();
  const rut = f.rut.value.trim();

  const div = document.getElementById('result');
  div.className = 'result';
  div.innerHTML = 'Registrando...';
  div.style.display = 'block';

  const r = await fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rut,
      first_name: firstName,
      last_name: lastName,
      birth_date: f.birth_date.value,
      email: rut.replace(/[^0-9kK]/g,'').toLowerCase() + '@getit.cl',
      boleta,
      marcas: 1
    })
  });
  const data = await r.json();

  if (r.ok) {
    const link = window.location.origin + data.wallet_link;
    div.className = 'result ok';
    div.innerHTML = '✓ Cliente registrado.<div class="card-link">Tarjeta: <a href="' + link + '" target="_blank">Ver tarjeta</a></div>';
    f.reset();
    document.querySelector('[name=rut]').focus();
    document.querySelector('[name=rut]').focus();
  } else {
    div.className = 'result err';
    div.textContent = data.error || 'Error al registrar.';
  }
});
</script>
</body></html>`);
}

async function renderCajaPage(req, res) {
  const staff = getAuthenticatedStaff(req);

  if (!staff) {
    return renderLoginPage(res, '/caja', 'Acceso de cajero');
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
  <span>Sesión: ${staff.name} (${staff.role === 'admin' ? 'administrador' : 'cajero'})</span>
  <div style="display:flex;gap:8px;">
    ${staff.role === 'admin' ? '<button onclick="window.location.href=\'/admin\'">Admin</button>' : ''}
    <button onclick="window.location.href='/registro'">+ Registrar cliente</button>
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
    <input name="rut" placeholder="12345678-5" required>
    <button type="submit">Buscar</button>
  </form>
  <form id="searchFormCode" style="display:none;">
    <label>Código de la tarjeta (debajo del QR)</label>
    <input name="code" placeholder="XXXX-XX" required>
    <button type="submit">Buscar</button>
  </form>
  <div id="searchResult"></div>

  <div id="customerCard" class="customer-card">
    <h3 id="custName"></h3>
    <div class="stamps" id="custStamps"></div>
    <form id="purchaseForm">
      <input type="hidden" name="card_token" id="cardToken">
      <label>N° de boleta</label>
      <input name="receipt_number" required>
      <label>Categoría (opcional)</label>
      <input name="category" placeholder="ej. comida">
      <button type="submit">Registrar compra y asignar marca</button>
    </form>
    <div id="purchaseResult"></div>
    <button class="secondary" onclick="redeem()" id="redeemBtn" style="display:none;">Canjear premio</button>
  </div>
</div>
<script>
let currentToken = null;

function switchTab(tab) {
  document.getElementById('tabRut').classList.toggle('active', tab === 'rut');
  document.getElementById('tabCode').classList.toggle('active', tab === 'code');
  document.getElementById('searchFormRut').style.display = tab === 'rut' ? 'block' : 'none';
  document.getElementById('searchFormCode').style.display = tab === 'code' ? 'block' : 'none';
  document.getElementById('searchResult').innerHTML = '';
}

async function logout() {
  await fetch('/api/auth/logout', { method:'POST' });
  window.location.href = '/caja';
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
  const rut = e.target.rut.value.trim();
  const r = await fetch('/api/customers/by-rut/' + encodeURIComponent(rut));
  const data = await r.json();
  if (r.status === 401) { window.location.href = '/caja'; return; }
  r.ok ? showCustomer(data) : showSearchError(data);
});

document.getElementById('searchFormCode').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = e.target.code.value.trim();
  const r = await fetch('/api/customers/by-code/' + encodeURIComponent(code));
  const data = await r.json();
  if (r.status === 401) { window.location.href = '/caja'; return; }
  r.ok ? showCustomer(data) : showSearchError(data);
});

document.getElementById('purchaseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    card_token: f.card_token.value,
    branch_id: 1,
    receipt_number: f.receipt_number.value,
    category: f.category.value || undefined
  };
  const r = await fetch('/api/purchases', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await r.json();
  const div = document.getElementById('purchaseResult');
  if (r.status === 401) { window.location.href = '/caja'; return; }
  if (r.ok) {
    div.className = 'result ok';
    div.textContent = '¡Marca asignada! Ahora tiene ' + data.current_stamps + ' marcas. Estado: ' + data.card_status;
    document.getElementById('custStamps').textContent = data.current_stamps + ' marcas';
    document.getElementById('redeemBtn').style.display = data.card_status === 'completed' ? 'block' : 'none';
    f.reset();
  } else {
    div.className = 'result err';
    div.textContent = data.error;
  }
});

async function redeem() {
  const rut = prompt('Validación obligatoria: ingresa el RUT del cliente para confirmar el canje (cédula de identidad):');
  if (!rut) return;
  const r = await fetch('/api/cards/' + currentToken + '/redeem', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rut }) });
  const data = await r.json();
  const div = document.getElementById('purchaseResult');
  if (r.status === 401) { window.location.href = '/caja'; return; }
  if (r.ok) {
    div.className = 'result ok';
    div.textContent = '¡Premio canjeado: ' + data.reward + '! La tarjeta volvió a 0.';
    document.getElementById('custStamps').textContent = '0 marcas';
    document.getElementById('redeemBtn').style.display = 'none';
  } else {
    div.className = 'result err';
    div.textContent = data.error;
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
