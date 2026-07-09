'use strict';

// Carga variables de entorno desde .env (si existe)
require('dotenv').config();

const os = require('os');

// IP LAN para el BASE_URL de desarrollo (permite abrir la app desde un celular
// en la misma red WiFi, igual que el monolito original).
function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const LAN_IP = getLanIp();

// BASE_URL: en prod se define explícitamente vía APP_URL (dominio público);
// en dev se arma con la IP LAN. Reemplaza la lógica atada a RENDER_* del monolito.
const BASE_URL = process.env.APP_URL || `http://${LAN_IP}:${PORT}`;

const SESSION_DURATION_MS = parseInt(
  process.env.SESSION_DURATION_MS || String(8 * 60 * 60 * 1000),
  10
);

const DATABASE_URL = process.env.DATABASE_URL || '';
// SSL a la base: Supabase lo exige. Por defecto se activa en producción.
const DB_SSL = (process.env.DB_SSL || (IS_PRODUCTION ? 'true' : 'false')) === 'true';
// Verificación del certificado del servidor. Seguro por defecto (true).
// Supabase entrega una CA descargable; apunta DB_CA_CERT a ese archivo para
// verificar la cadena. Solo pon DB_SSL_REJECT_UNAUTHORIZED=false como último recurso.
const DB_SSL_REJECT_UNAUTHORIZED =
  (process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true') === 'true';
const DB_CA_CERT = process.env.DB_CA_CERT || '';
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX || '10', 10);

// Usuarios seed. Passwords vienen de env; los defaults históricos se conservan
// solo para arranque en desarrollo (el runbook obliga a sobre-escribirlos en prod).
const SEED = {
  superadmin: {
    username: 'MasterMind',
    name: 'MasterMind',
    password: process.env.SEED_SUPERADMIN_PASSWORD || '12345678',
  },
  admin: {
    username: 'adm2026',
    name: 'Administrador',
    password: process.env.SEED_ADMIN_PASSWORD || '12345678',
  },
  cashier: {
    username: 'tienda_1',
    name: 'Cajero Tienda 1',
    password: process.env.SEED_CASHIER_PASSWORD || '1234',
  },
};

module.exports = {
  PORT,
  NODE_ENV,
  IS_PRODUCTION,
  LAN_IP,
  BASE_URL,
  SESSION_DURATION_MS,
  DATABASE_URL,
  DB_SSL,
  DB_SSL_REJECT_UNAUTHORIZED,
  DB_CA_CERT,
  DB_POOL_MAX,
  SEED,
};
