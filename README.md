# Sistema de Fidelización Digital — GETit

Sistema de tarjetas de fidelización digital con panel admin, pantalla de caja, dashboard de análisis y cruce de ventas.

## Uso local (Windows)

1. Instalar Node.js 22+ desde https://nodejs.org
2. Doble clic en `iniciar-windows.bat`
3. Se abre automáticamente en el navegador en `http://localhost:3000`

**Usuarios por defecto:**
- Admin: `adm2026` / `12345678`
- Cajero: `tienda_1` / `1234`

## Despliegue en Render (internet)

### Paso 1 — Subir a GitHub
1. Crear cuenta en https://github.com
2. Crear repositorio nuevo (público)
3. Subir los archivos: `app.js` y `package.json`

### Paso 2 — Crear servicio en Render
1. Crear cuenta en https://render.com
2. New → Web Service → conectar el repositorio de GitHub
3. Configurar:
   - **Name:** getit-fidelizacion (o el nombre que quieras)
   - **Runtime:** Node
   - **Build Command:** (dejar vacío)
   - **Start Command:** `node app.js`
   - **Plan:** Free
4. Click en **Create Web Service**

### Paso 3 — Listo
Render te dará una URL del tipo `https://getit-fidelizacion.onrender.com`.
Esa URL funciona desde cualquier celular, en cualquier parte del mundo.

## ⚠️ Nota importante sobre datos en Render gratuito

El plan gratuito de Render **no tiene disco persistente**.
Los datos sobreviven mientras el servicio está activo, pero **se borran si haces un nuevo deploy**.

**Antes de cada deploy:** descarga tu base de datos desde el Dashboard → botón "⬇ Descargar base de datos (.db)".

Para producción real con datos permanentes, considera Railway ($5 USD/mes) o un VPS.
