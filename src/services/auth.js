'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };

const MIN_PASSWORD_LENGTH = 8;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [kind, n, saltB64, hashB64] = stored.split('$');
  if (kind !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { ...PARAMS, N: Number(n) });
  return crypto.timingSafeEqual(expected, actual);
}

// Für unbekannte Nutzernamen trotzdem rechnen, damit die Antwortzeit nichts verrät.
let dummyHash = null;
async function verifyDummy(password) {
  if (!dummyHash) dummyHash = await hashPassword('dummy-password');
  await verifyPassword(password, dummyHash);
  return false;
}

function validateCredentials(username, password, passwordRepeat) {
  const errors = [];
  if (!USERNAME_RE.test(username || '')) {
    errors.push('Der Nutzername muss 3–32 Zeichen lang sein (Buchstaben, Ziffern, Punkt, Binde- und Unterstrich).');
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  } else if (password !== passwordRepeat) {
    errors.push('Die Passwörter stimmen nicht überein.');
  }
  return errors;
}

module.exports = { hashPassword, verifyPassword, verifyDummy, validateCredentials, MIN_PASSWORD_LENGTH };
