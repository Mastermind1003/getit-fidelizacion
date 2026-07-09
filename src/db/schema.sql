-- =====================================================================
-- Esquema PostgreSQL — getit-fidelizacion
-- Portado desde el SQLite del monolito (node:sqlite). Idempotente.
--   AUTOINCREMENT      -> GENERATED ALWAYS AS IDENTITY
--   INTEGER bool 0/1   -> SMALLINT (se preserva la semántica = 1 / <> 0)
--   TEXT JSON          -> JSONB
--   TEXT timestamp     -> TIMESTAMPTZ DEFAULT now()
--   REAL (dinero)      -> NUMERIC(12,2)
--   sessions.expires_at (epoch ms) -> BIGINT
-- =====================================================================

CREATE TABLE IF NOT EXISTS branches (
  id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name    TEXT NOT NULL,
  address TEXT,
  active  SMALLINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS staff_users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id),
  name          TEXT NOT NULL,
  username      TEXT UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'cashier'
                CHECK (role IN ('cashier','manager','admin','superadmin')),
  active        SMALLINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rut             TEXT UNIQUE NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  birth_date      TEXT NOT NULL,
  email           TEXT UNIQUE,
  whatsapp_number TEXT UNIQUE,
  signed_up_by    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_programs (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT NOT NULL,
  required_stamps INTEGER NOT NULL DEFAULT 10,
  rules_json      JSONB DEFAULT '{}'::jsonb,
  logo_url        TEXT,
  logo_width      INTEGER DEFAULT 200,
  primary_color   TEXT DEFAULT '#16321f',
  secondary_color TEXT DEFAULT '#0f1115',
  stamp_icon      TEXT DEFAULT '★',
  stamp_color     TEXT DEFAULT '#d62828',
  stamp_size      INTEGER DEFAULT 22,
  active          SMALLINT DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_cards (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  program_id     INTEGER NOT NULL REFERENCES loyalty_programs(id),
  unique_token   TEXT UNIQUE NOT NULL,
  short_code     TEXT UNIQUE,
  current_stamps INTEGER DEFAULT 0,
  status         TEXT DEFAULT 'active'
                 CHECK (status IN ('active','completed','expired')),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id         INTEGER NOT NULL REFERENCES customers(id),
  branch_id           INTEGER NOT NULL REFERENCES branches(id),
  receipt_number      TEXT NOT NULL,
  purchase_date       TIMESTAMPTZ DEFAULT now(),
  amount              NUMERIC(12,2) NOT NULL,
  category            TEXT,
  created_by_staff_id INTEGER REFERENCES staff_users(id),
  UNIQUE (branch_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS stamp_events (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  loyalty_card_id INTEGER NOT NULL REFERENCES loyalty_cards(id),
  purchase_id    INTEGER REFERENCES purchases(id),
  staff_id       INTEGER REFERENCES staff_users(id),
  branch_id      INTEGER REFERENCES branches(id),
  type           TEXT NOT NULL CHECK (type IN ('grant','revoke')),
  reason         TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Un único 'grant' por compra (índice parcial, soportado por Postgres)
CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_per_purchase
  ON stamp_events (purchase_id)
  WHERE type = 'grant';

CREATE TABLE IF NOT EXISTS rewards (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_id      INTEGER NOT NULL REFERENCES loyalty_programs(id),
  name            TEXT NOT NULL,
  description     TEXT,
  stamps_required INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  loyalty_card_id INTEGER NOT NULL REFERENCES loyalty_cards(id),
  reward_id       INTEGER REFERENCES rewards(id),
  staff_id        INTEGER REFERENCES staff_users(id),
  branch_id       INTEGER REFERENCES branches(id),
  redeemed_at     TIMESTAMPTZ DEFAULT now(),
  status          TEXT DEFAULT 'redeemed'
                  CHECK (status IN ('redeemed','cancelled'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_staff_id INTEGER,
  action         TEXT NOT NULL,
  entity         TEXT NOT NULL,
  entity_id      INTEGER,
  before_json    JSONB,
  after_json     JSONB,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications_log (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  INTEGER REFERENCES customers(id),
  channel      TEXT DEFAULT 'whatsapp',
  message_type TEXT,
  content      TEXT,
  sent_at      TIMESTAMPTZ DEFAULT now(),
  status       TEXT DEFAULT 'sent'
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  staff_id   INTEGER NOT NULL REFERENCES staff_users(id),
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_detail (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rut          TEXT,
  documento    TEXT,
  fecha        TEXT,
  hora         TEXT,
  cajero       TEXT,
  producto     TEXT,
  grupo        TEXT,
  cantidad     NUMERIC,
  total_neto   NUMERIC,
  total_bruto  NUMERIC,
  import_batch TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_rut ON sales_detail(rut);
CREATE INDEX IF NOT EXISTS idx_sales_doc ON sales_detail(documento);

CREATE TABLE IF NOT EXISTS loyalty_registry (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rut          TEXT,
  nombre       TEXT,
  fecha_nac    TEXT,
  correo       TEXT,
  boleta       TEXT,
  stickers     INTEGER,
  dia          INTEGER,
  mes          INTEGER,
  cajero       TEXT,
  import_batch TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_registry_boleta ON loyalty_registry(boleta);
CREATE INDEX IF NOT EXISTS idx_registry_rut ON loyalty_registry(rut);

-- ── Tablas de configuración editable (patrón singleton, fila id=1) ────
CREATE TABLE IF NOT EXISTS registro_config (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  logo_url         TEXT DEFAULT 'https://i.imgur.com/nJrUCee.png',
  logo_width       INTEGER DEFAULT 140,
  titulo           TEXT DEFAULT 'Club de Fidelización',
  subtitulo        TEXT DEFAULT 'Regístrate y acumula marcas con tus compras',
  bg_color         TEXT DEFAULT '#f4f4f5',
  btn_color        TEXT DEFAULT '#16321f',
  btn_texto        TEXT DEFAULT 'Crear mi tarjeta',
  campo_rut        SMALLINT DEFAULT 1,
  campo_nombre     SMALLINT DEFAULT 1,
  campo_apellido   SMALLINT DEFAULT 1,
  campo_correo     SMALLINT DEFAULT 1,
  campo_telefono   SMALLINT DEFAULT 1,
  campo_nacimiento SMALLINT DEFAULT 1,
  chk1_texto       TEXT DEFAULT 'He leído y acepto los Términos y Condiciones del Club de Fidelización Get it.',
  chk2_texto       TEXT DEFAULT 'Autorizo a Get it a usar mis datos personales para gestionar mi membresía y enviarme comunicaciones sobre ofertas, promociones y beneficios del club.',
  tyc_texto        TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS login_config (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  logo_url   TEXT DEFAULT 'https://i.imgur.com/nJrUCee.png',
  logo_width INTEGER DEFAULT 120,
  bg_color   TEXT DEFAULT '#f4f4f5',
  btn_color  TEXT DEFAULT '#16321f',
  btn_texto  TEXT DEFAULT 'Ingresar'
);

CREATE TABLE IF NOT EXISTS tyc_config (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  logo_url            TEXT DEFAULT 'https://i.imgur.com/nJrUCee.png',
  logo_width          INTEGER DEFAULT 120,
  bg_color            TEXT DEFAULT '#f4f4f5',
  card_color          TEXT DEFAULT '#ffffff',
  title_color         TEXT DEFAULT '#16321f',
  h2_color            TEXT DEFAULT '#16321f',
  text_color          TEXT DEFAULT '#333333',
  razon_social        TEXT DEFAULT 'Convenience de Chile SPA',
  rut                 TEXT DEFAULT '76.865.177-9',
  nombre_fantasia     TEXT DEFAULT 'Get it',
  domicilio           TEXT DEFAULT 'Santiago, Región Metropolitana, Chile',
  titulo              TEXT DEFAULT 'Términos y Condiciones del Club de Fidelización',
  fecha_actualizacion TEXT DEFAULT '08 de julio de 2026',
  s1_titulo TEXT DEFAULT '1. Aceptación de los términos',
  s1_texto  TEXT DEFAULT 'Al registrarte en el Club de Fidelización Get it, declaras haber leído, comprendido y aceptado los presentes Términos y Condiciones. Si no estás de acuerdo con alguno de ellos, no debes completar el registro.',
  s2_titulo TEXT DEFAULT '2. El programa de fidelización',
  s2_texto  TEXT DEFAULT 'El Club de Fidelización Get it es un programa administrado por Convenience de Chile SPA que permite a sus miembros acumular marcas por cada visita o compra realizada en los establecimientos participantes de la marca Get it.',
  s3_titulo TEXT DEFAULT '3. Registro y membresía',
  s3_texto  TEXT DEFAULT 'Para participar en el programa, el cliente debe registrarse proporcionando datos verídicos y actualizados. Cada persona puede tener una sola cuenta asociada a su RUT. El registro es personal e intransferible.',
  s4_titulo TEXT DEFAULT '4. Tratamiento de datos personales',
  s4_texto  TEXT DEFAULT 'De conformidad con la Ley N° 19.628 sobre Protección de la Vida Privada, Convenience de Chile SPA trata los datos personales exclusivamente para gestionar la membresía, acreditar marcas y canjes, y enviar comunicaciones sobre beneficios del Club. No compartirá estos datos a terceros sin consentimiento expreso del titular, salvo requerimiento legal.',
  s5_titulo TEXT DEFAULT '5. Derechos del titular de datos',
  s5_texto  TEXT DEFAULT 'Conforme a la Ley N° 19.628, el cliente tiene derecho a acceder, rectificar y solicitar la eliminación de sus datos personales, así como revocar el consentimiento para comunicaciones comerciales. Para ejercer estos derechos, puede contactar directamente a un establecimiento Get it.',
  s6_titulo TEXT DEFAULT '6. Seguridad de la información',
  s6_texto  TEXT DEFAULT 'Convenience de Chile SPA adopta medidas técnicas y organizativas razonables para proteger los datos personales de sus miembros contra accesos no autorizados, pérdida o alteración.',
  s7_titulo TEXT DEFAULT '7. Modificaciones',
  s7_texto  TEXT DEFAULT 'Convenience de Chile SPA se reserva el derecho de actualizar estos Términos y Condiciones. Las modificaciones serán informadas a través de los canales del programa y entrarán en vigencia desde su publicación. El uso continuado del programa implica la aceptación de los términos actualizados.',
  s8_titulo TEXT DEFAULT '8. Legislación aplicable',
  s8_texto  TEXT DEFAULT 'Estos Términos y Condiciones se rigen por las leyes de la República de Chile. Cualquier controversia derivada del presente programa será sometida a los tribunales ordinarios de justicia de Santiago.'
);
