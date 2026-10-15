'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function trustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/** Liest den Session-Schlüssel aus der Umgebung oder legt ihn im Datenordner ab. */
function sessionSecret(dataDir, fromEnv) {
  if (fromEnv) return fromEnv;
  const file = path.join(dataDir, '.session-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  fs.mkdirSync(dataDir, { recursive: true });
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || './data');
  return {
    port: Number(env.PORT || 3000),
    dataDir,
    storage: env.STORAGE || 'json',
    sessionSecret: sessionSecret(dataDir, env.SESSION_SECRET),
    cookieSecure: bool(env.COOKIE_SECURE),
    trustProxy: trustProxy(env.TRUST_PROXY),
    production: env.NODE_ENV === 'production',
  };
}

module.exports = { loadConfig };
