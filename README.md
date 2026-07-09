# Sistema de Fidelización Digital — GETit

Tarjetas de fidelización digital con panel admin, pantalla de caja, registro de
clientes, dashboard de ventas y cruce de boletas.

**Stack:** Node.js + Express · PostgreSQL (Supabase) · vistas SSR. Sin build step.

## Estructura

```
src/
  server.js            arranque (verifica DB, levanta Express)
  app.js               express: middleware + routers + errores
  config.js            configuración por variables de entorno
  db/                  pool pg (type parsers) + schema.sql
  middleware/          auth, errores, rate-limit
  lib/                 rut, password (scrypt), tokens, qr, http
  modules/             un módulo por dominio (routes + service + repo)
    auth/ customers/ cards/ purchases/ rewards/ programs/
    admin/ (users, config, data)  public-pages/ (rutas de vistas)
  views/               una función render por página (SSR)
public/                assets estáticos (css/js compartido)
scripts/               migrate.js · seed.js · import-sqlite.js (opcional)
deploy/                nginx-fidelizacion.conf
ecosystem.config.js    pm2
```

## Desarrollo local

1. **Node 18+** y un **PostgreSQL** (local o Docker):
   ```bash
   docker run -d --name fidel-pg -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=fidelizacion -p 5433:5432 postgres:16-alpine
   ```
2. Copia `.env.example` a `.env` y ajusta `DATABASE_URL` (con Docker, el ejemplo
   ya apunta a `localhost:5433`). Deja `DB_SSL=false` en local.
3. Instala, migra, siembra y arranca:
   ```bash
   npm install
   npm run migrate     # crea el esquema (idempotente)
   npm run seed        # sucursal + programa + usuarios de acceso
   npm start           # http://localhost:3000
   ```

**Usuarios por defecto** (passwords vía env `SEED_*`, defaults solo para dev):
- Super admin: `MasterMind` / `12345678`
- Admin: `adm2026` / `12345678`
- Cajero: `tienda_1` / `1234`

Rutas: `/registro` (alta pública) · `/admin` · `/caja` · `/mi-tarjeta` ·
`/tarjeta/:token` · `/cartel-qr` · `/terminos`.

## Variables de entorno

| Var | Descripción |
|---|---|
| `PORT` | Puerto del server (default 3000; en prod ej. 3100) |
| `NODE_ENV` | `production` activa cookie Secure y SSL por defecto |
| `APP_URL` | URL pública base (para QR/links). Ej. `https://fidelizacion.getitchile.cl` |
| `DATABASE_URL` | Cadena de conexión Postgres (Supabase session pooler) |
| `DB_SSL` | `true` en prod (Supabase lo exige) |
| `DB_CA_CERT` | Ruta a la CA de Supabase para verificar el certificado (recomendado) |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` por defecto (no desactivar salvo último recurso) |
| `SESSION_DURATION_MS` | Duración de sesión (default 8h) |
| `SEED_SUPERADMIN_PASSWORD` / `SEED_ADMIN_PASSWORD` / `SEED_CASHIER_PASSWORD` | Passwords de los usuarios seed (obligatorio sobre-escribir en prod) |

## Despliegue — EC2 co-locado (`apps.getitchile.cl`)

Reutiliza el servidor existente con un vhost de nginx y un subdominio propio.

1. **Supabase**: crea un proyecto/DB dedicado. Copia el *connection string*
   (Session pooler) y, opcionalmente, descarga la **CA** (Database → SSL).

2. **En el EC2** (Node 18+ ya instalado; si no, vía nodesource/nvm):
   ```bash
   git clone <repo> /opt/getit-fidelizacion && cd /opt/getit-fidelizacion
   npm ci --omit=dev
   cp .env.example .env      # editar:
   #   PORT=3100  NODE_ENV=production
   #   APP_URL=https://fidelizacion.getitchile.cl
   #   DATABASE_URL=...  DB_SSL=true  DB_CA_CERT=/opt/getit-fidelizacion/supabase-ca.crt
   #   SEED_*_PASSWORD=...(fuertes)
   npm run migrate && npm run seed
   ```

3. **Proceso (pm2):**
   ```bash
   npm i -g pm2
   pm2 start ecosystem.config.js && pm2 save && pm2 startup   # arranque en boot
   ```

4. **nginx**: copia `deploy/nginx-fidelizacion.conf` a
   `/etc/nginx/sites-available/`, enlázalo en `sites-enabled/`, ajusta el puerto
   interno (3100) y recarga: `sudo nginx -t && sudo systemctl reload nginx`.

5. **DNS + TLS**: en **Cloudflare** apunta `fidelizacion.getitchile.cl` al EC2.
   TLS con `sudo certbot --nginx -d fidelizacion.getitchile.cl` (o el origin cert
   de Cloudflare si el dominio va proxied).

6. **Verifica persistencia**: `pm2 restart getit-fidelizacion` y confirma que los
   datos siguen (era el objetivo del cambio: la base es Postgres, no un archivo).

**Deploys siguientes:** `git pull && npm ci --omit=dev && npm run migrate && pm2 reload getit-fidelizacion`.

## Migración de datos (opcional)

Si tienes un `loyalty.db` del sistema anterior con datos reales:
```bash
SQLITE_DB=/ruta/loyalty.db node scripts/import-sqlite.js   # requiere Node 22+
```
Corre contra una base recién migrada y **vacía** (antes del seed) para preservar ids.

## Notas de seguridad

- Passwords con `scrypt` + `timingSafeEqual`; sesiones en tabla `sessions`,
  cookie `HttpOnly` + `Secure` (prod) + `SameSite=Lax`.
- Rate-limit de login (5/15min por IP+usuario) vía `express-rate-limit`.
- `helmet` para headers. Todos los `GET /api/admin/*` requieren rol admin; los
  `PUT` de configuración/diseño requieren super admin.
- Pendiente (hardening futuro): CSP a medida y `integrity`/SRI en el `<script>`
  de SheetJS (CDN) del panel admin.
