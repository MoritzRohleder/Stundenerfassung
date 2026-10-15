'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

// Durchlauf durch die echte Anwendung über HTTP.

class Client {
  constructor(base) {
    this.base = base;
    this.cookie = '';
  }

  async request(method, url, form) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(this.base + url, { method, headers, body, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text, headers: res.headers };
  }

  get(url) {
    return this.request('GET', url);
  }

  async csrf(url) {
    const page = await this.get(url);
    const m = page.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(m, `CSRF-Token auf ${url}`);
    return m[1];
  }

  /** Datei-Upload (multipart) mit CSRF-Token von der Seite `from`. */
  async upload(url, fields, file, from = url) {
    const token = await this.csrf(from);
    const fd = new FormData();
    fd.set('_csrf', token);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    if (file) fd.set('file', new Blob([file.content], { type: 'application/json' }), file.name);
    const res = await fetch(this.base + url, { method: 'POST', headers: { cookie: this.cookie }, body: fd, redirect: 'manual' });
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }

  async download(url) {
    const res = await fetch(this.base + url, { headers: { cookie: this.cookie }, redirect: 'manual' });
    return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  }

  async post(url, form, from = url) {
    const token = await this.csrf(from);
    const params = new URLSearchParams(form);
    params.set('_csrf', token);
    return this.request('POST', url, params);
  }
}

async function start(today = '2026-10-14') {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-app-'));
  const { app, close } = await createApp(
    { port: 0, dataDir, storage: 'json', sessionSecret: 'test', cookieSecure: false, trustProxy: false, production: false },
    { clock: { today: () => today } },
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    async stop() {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await close();
    },
  };
}

async function registerAndSetup(c, username = 'anna') {
  let res = await c.post('/registrieren', { username, password: 'geheim123', password_repeat: 'geheim123' });
  assert.equal(res.status, 302);
  assert.equal(res.location, '/einrichtung');
  res = await c.get('/');
  assert.equal(res.location, '/einrichtung', 'ohne Einrichtung geht es nicht weiter');
  const params = new URLSearchParams({
    state: 'NI', tracking_start: '01.10.2026', overtime_sign: 'plus', overtime_start: '2:00', vacation_days_default: '30', weekly: '40',
  });
  for (const d of ['1', '2', '3', '4', '5']) params.append('workdays', d);
  res = await c.post('/einrichtung', params);
  assert.equal(res.status, 302);
}


module.exports = { Client, start, registerAndSetup };
