'use strict';

const crypto = require('node:crypto');

/** Sicherheits-Header auf allen Seiten (Spec 10.4). */
function securityHeaders({ hsts }) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
  return (req, res, next) => {
    res.set('Content-Security-Policy', csp);
    res.set('X-Frame-Options', 'DENY');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    if (hsts) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}

/** Prüft den CSRF-Token einer Anfrage; gibt einen Fehler oder null zurück. */
function verifyCsrf(req) {
  const sent = (req.body && req.body._csrf) || req.get('X-CSRF-Token') || '';
  const expected = Buffer.from(req.session.csrfToken || '');
  const actual = Buffer.from(String(sent));
  if (expected.length && actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) return null;
  const err = new Error('Das Formular ist abgelaufen. Bitte lade die Seite neu und versuche es noch einmal.');
  err.status = 403;
  return err;
}

// Datei-Uploads (multipart) werden erst in der Route gelesen; dort wird der Token geprüft.
const MULTIPART_ROUTES = new Set(['/daten/import']);

/** CSRF-Schutz: Token in der Sitzung, Pflicht bei jedem POST. */
function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  if (req.method !== 'POST') return next();
  if (req.is('multipart/form-data') && MULTIPART_ROUTES.has(req.path)) return next();
  return next(verifyCsrf(req) || undefined);
}

/** Nur interne Pfade als Rücksprungziel (kein Open Redirect). */
function safeReturn(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}

/**
 * Login-Bremse: nach 5 Fehlversuchen je IP+Name warten (30 s, verdoppelnd, max. 15 min);
 * zusätzlich max. 30 Fehlversuche je IP in 15 min.
 */
function createLoginLimiter({ now = () => Date.now() } = {}) {
  const perKey = new Map();
  const perIp = new Map();
  const WINDOW = 15 * 60 * 1000;

  function key(ip, username) {
    return `${ip}|${String(username || '').toLowerCase()}`;
  }

  function waitSeconds(ip, username) {
    const t = now();
    const ipEntry = perIp.get(ip);
    if (ipEntry) {
      ipEntry.times = ipEntry.times.filter((x) => t - x < WINDOW);
      if (ipEntry.times.length >= 30) return Math.ceil((ipEntry.times[0] + WINDOW - t) / 1000);
    }
    const entry = perKey.get(key(ip, username));
    if (entry && entry.blockedUntil > t) return Math.ceil((entry.blockedUntil - t) / 1000);
    return 0;
  }

  function fail(ip, username) {
    const t = now();
    const ipEntry = perIp.get(ip) || { times: [] };
    ipEntry.times.push(t);
    perIp.set(ip, ipEntry);
    const k = key(ip, username);
    const entry = perKey.get(k) || { failures: 0, blockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= 5) {
      const seconds = Math.min(30 * 2 ** (entry.failures - 5), 15 * 60);
      entry.blockedUntil = t + seconds * 1000;
    }
    perKey.set(k, entry);
  }

  function success(ip, username) {
    perKey.delete(key(ip, username));
  }

  return { waitSeconds, fail, success };
}

module.exports = { securityHeaders, csrf, verifyCsrf, safeReturn, createLoginLimiter };
