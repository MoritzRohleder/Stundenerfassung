'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');

const { loadConfig } = require('./config');
const { createStorage } = require('./storage');
const { createRepositories } = require('./repositories');
const { FileSessionStore } = require('./middleware/sessionStore');
const { securityHeaders, csrf, createLoginLimiter } = require('./middleware/security');
const { loadUser, requireLogin, requireSetup } = require('./middleware/auth');
const { authRoutes } = require('./routes/auth');
const { mainRoutes } = require('./routes/main');
const { settingsRoutes, settingsPagesRoutes } = require('./routes/settings');
const viewHelpers = require('./utils/viewHelpers');
const { todayISO } = require('./utils/date');
const pkg = require('../package.json');

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

async function createApp(config = loadConfig(), { clock = { today: () => todayISO() } } = {}) {
  const storage = await createStorage(config);
  const repos = createRepositories(storage);
  const sessionStore = new FileSessionStore({ file: path.join(config.dataDir, 'sessions.json'), ttlMs: SESSION_TTL });
  const limiter = createLoginLimiter();

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', config.trustProxy);
  app.set('view cache', config.production);
  app.disable('x-powered-by');

  app.use(securityHeaders({ hsts: config.cookieSecure }));
  // Grundwerte für alle Templates, auch für Fehlerseiten vor dem Login.
  app.use((req, res, next) => {
    Object.assign(res.locals, viewHelpers);
    res.locals.version = pkg.version;
    res.locals.path = req.path;
    res.locals.today = clock.today();
    res.locals.user = null;
    res.locals.flash = null;
    res.locals.csrfToken = '';
    next();
  });

  const staticOpts = { maxAge: config.production ? '7d' : 0 };
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), staticOpts));
  app.use('/vendor/pico', express.static(path.join(path.dirname(require.resolve('@picocss/pico/package.json')), 'css'), staticOpts));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(
    session({
      name: 'se.sid',
      store: sessionStore,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: SESSION_TTL },
    }),
  );
  app.use((req, res, next) => {
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    next();
  });
  app.use(csrf);
  app.use(loadUser(repos));

  app.use(authRoutes({ repos, limiter }));
  app.use(requireLogin);
  app.use(settingsRoutes({ repos, clock }));
  app.use(requireSetup);
  app.use(mainRoutes({ repos, clock }));
  app.use(settingsPagesRoutes({ repos, clock }));

  app.use((req, res, next) => {
    const err = new Error('Seite nicht gefunden');
    err.status = 404;
    next(err);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).render('error', {
      title: status === 404 ? 'Nicht gefunden' : 'Fehler',
      status,
      message: status >= 500 ? 'Es ist ein Fehler aufgetreten.' : err.message,
    });
  });

  async function close() {
    await storage.close();
    await sessionStore.save();
  }

  return { app, close, storage, repos };
}

async function main() {
  const config = loadConfig();
  const { app, close } = await createApp(config);
  const server = app.listen(config.port, () => {
    console.log(`Stundenerfassung ${pkg.version} läuft auf http://localhost:${config.port}`);
  });
  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} empfangen, fahre herunter …`);
    server.close(async () => {
      await close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createApp };
