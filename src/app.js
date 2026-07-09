'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const { attachStaff } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

// Detrás de nginx + Cloudflare: confía en el primer proxy para req.ip / secure.
app.set('trust proxy', 1);

// helmet sin CSP: las vistas usan estilos e inline scripts embebidos y el admin
// carga SheetJS desde CDN. (Se puede endurecer con una CSP a medida más adelante.)
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Assets estáticos compartidos (CSS/JS deduplicado).
app.use(express.static(path.join(__dirname, '..', 'public')));

// Adjunta req.staff a partir de la cookie de sesión (global).
app.use(attachStaff);

// ---- Routers de API ----
app.use(require('./modules/auth/auth.routes'));
app.use(require('./modules/customers/customers.routes'));
app.use(require('./modules/customers/customers.admin.routes'));
app.use(require('./modules/cards/cards.routes'));
app.use(require('./modules/purchases/purchases.routes'));
app.use(require('./modules/programs/programs.routes'));
app.use(require('./modules/admin/users.routes'));
app.use(require('./modules/admin/config.routes'));
app.use(require('./modules/admin/data.routes'));

// ---- Páginas (vistas SSR) ----
app.use(require('./modules/public-pages/pages.routes'));

// 404 + manejador central de errores (siempre al final).
app.use(notFound);
app.use(errorHandler);

module.exports = app;
