'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Client, start, registerAndSetup } = require('./helpers');

test('Health-Check ohne Login', async (t) => {
  const s = await start();
  t.after(() => s.stop());
  const res = await fetch(`${s.base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
});

test('Seiten sind nur angemeldet erreichbar', async (t) => {
  const s = await start();
  t.after(() => s.stop());
  const c = new Client(s.base);
  for (const url of ['/', '/monat', '/jahr/2026', '/tag/2026-10-14', '/einstellungen']) {
    const res = await c.get(url);
    assert.equal(res.status, 302, url);
    assert.equal(res.location, '/login', url);
  }
});

test('Einrichtung verlangt alle Angaben ohne Vorbelegung', async (t) => {
  const s = await start();
  t.after(() => s.stop());
  const c = new Client(s.base);
  await c.post('/registrieren', { username: 'bert', password: 'geheim123', password_repeat: 'geheim123' }, '/registrieren');
  const page = await c.get('/einrichtung');
  assert.match(page.text, /name="overtime_start" value=""/);
  assert.match(page.text, /name="weekly" value=""/);
  const res = await c.post('/einrichtung', {});
  assert.equal(res.status, 400);
  assert.match(res.text, /Bundesland/);
  assert.match(res.text, /Wochenarbeitszeit/);
  assert.match(res.text, /Arbeitstag/);
});

test('Ganzer Ablauf: Tag erfassen, Monat und Jahr ansehen', async (t) => {
  const s = await start('2026-10-14');
  t.after(() => s.stop());
  const c = new Client(s.base);
  await registerAndSetup(c);

  // Dashboard
  let res = await c.get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Überstundenkonto/);

  // Tag mit zwei Blöcken
  const day = new URLSearchParams({ manual_break: '', absence_type: '', note: 'Testtag', action: 'stay' });
  day.append('start', '7:30'); day.append('end', '12:00');
  day.append('start', '1245'); day.append('end', '16');
  day.append('start', ''); day.append('end', '');
  res = await c.post('/tag/2026-10-12', day, '/tag/2026-10-12');
  assert.equal(res.status, 302);
  res = await c.get('/tag/2026-10-12');
  assert.match(res.text, /value="07:30"/);
  assert.match(res.text, /45 min <small>\(Lücken\)/);
  assert.match(res.text, /7:45 h/);

  // Fehler: Überschneidung
  const bad = new URLSearchParams({ action: 'stay' });
  bad.append('start', '8'); bad.append('end', '12');
  bad.append('start', '11'); bad.append('end', '13');
  res = await c.post('/tag/2026-10-13', bad, '/tag/2026-10-13');
  assert.equal(res.status, 400);
  assert.match(res.text, /überschneiden sich/);

  // Fehler: halber Krankheitstag
  const sick = new URLSearchParams({ absence_type: 'sick', absence_fraction: '0.5', action: 'stay' });
  res = await c.post('/tag/2026-10-13', sick, '/tag/2026-10-13');
  assert.equal(res.status, 400);
  assert.match(res.text, /nur als ganzen Tag/);

  // Fehler: Abwesenheit am Wochenende
  res = await c.post('/tag/2026-10-17', { absence_type: 'vacation', absence_fraction: '1', action: 'stay' }, '/tag/2026-10-17');
  assert.equal(res.status, 400);

  // Halber Urlaubstag
  const half = new URLSearchParams({ absence_type: 'vacation', absence_fraction: '0.5', action: 'stay' });
  half.append('start', '8'); half.append('end', '12');
  res = await c.post('/tag/2026-10-13', half, '/tag/2026-10-13');
  assert.equal(res.status, 302);

  // Monat
  res = await c.get('/monat/2026/10');
  assert.equal(res.status, 200);
  assert.match(res.text, /KW 42/);
  assert.match(res.text, /Tag der Deutschen Einheit/);
  assert.match(res.text, /½ Urlaub/);
  assert.match(res.text, /Testtag/);

  // Jahr
  res = await c.get('/jahr/2026');
  assert.equal(res.status, 200);
  assert.match(res.text, /Oktober/);
  res = await c.get('/jahr/2026?j=2025');
  assert.equal(res.location, '/jahr/2025');
  res = await c.get('/jahr/2025');
  assert.equal(res.status, 200);

  // Tag leeren
  res = await c.post('/tag/2026-10-12/loeschen', { back: '/monat/2026/10' }, '/tag/2026-10-12');
  assert.equal(res.location, '/monat/2026/10');
  res = await c.get('/tag/2026-10-12');
  assert.doesNotMatch(res.text, /value="07:30"/);

  // Urlaub für einen Zeitraum
  res = await c.post('/abwesenheit/neu', { from: '2026-12-21', to: '2027-01-03', absence_type: 'vacation' });
  assert.equal(res.status, 302);
  res = await c.get('/');
  assert.match(res.text, /davon 8 geplant/);

  // Zeitraum mit anderer Arbeitszeit
  const period = new URLSearchParams({ valid_from: '01.02.2027', valid_to: '10.04.2027', weekly: '20', note: 'Test' });
  for (const d of ['1', '2', '3', '4', '5']) period.append('workdays', d);
  res = await c.post('/einstellungen/arbeitszeit/neu', period, '/einstellungen/arbeitszeit/neu');
  assert.equal(res.status, 302);
  res = await c.get('/tag/2027-02-01');
  assert.match(res.text, /4:00 h/);
  res = await c.get('/einstellungen/arbeitszeit');
  assert.match(res.text, /01\.02\.2027 – 10\.04\.2027/);
  const editUrl = res.text.match(/href="(\/einstellungen\/arbeitszeit\/[0-9a-f-]{36}\/bearbeiten)"[^>]*>Bearbeiten<\/a>\s*<form/)[1];
  res = await c.get(editUrl);
  assert.match(res.text, /name="valid_from" value="01\.02\.2027"/, 'Datumsfeld zeigt deutsches Format');
  res = await c.get('/einstellungen');
  assert.match(res.text, /name="tracking_start" value="01\.10\.2026"/);
  assert.doesNotMatch(res.text, /type="date"/);

  // Ungültige Adressen
  assert.equal((await c.get('/tag/2026-02-30')).status, 404);
  assert.equal((await c.get('/monat/2026/13')).status, 404);

});

test('POST ohne CSRF-Token wird abgelehnt', async (t) => {
  const s = await start();
  t.after(() => s.stop());
  const c = new Client(s.base);
  await c.get('/login');
  const res = await c.request('POST', '/login', { username: 'x', password: 'y' });
  assert.equal(res.status, 403);
});

test('Login-Bremse nach 5 Fehlversuchen', async (t) => {
  const s = await start();
  t.after(() => s.stop());
  const c = new Client(s.base);
  for (let i = 0; i < 5; i++) {
    const res = await c.post('/login', { username: 'niemand', password: 'falsch123' }, '/login');
    assert.equal(res.status, 401);
    assert.match(res.text, /Nutzername oder Passwort falsch/);
  }
  const res = await c.post('/login', { username: 'niemand', password: 'falsch123' }, '/login');
  assert.equal(res.status, 429);
});

test('Daten anderer Nutzer sind nicht sichtbar', async (t) => {
  const s = await start();
  t.after(() => s.stop());
  const a = new Client(s.base);
  await registerAndSetup(a, 'anna');
  const params = new URLSearchParams({ note: 'Geheim', action: 'stay' });
  params.append('start', '8'); params.append('end', '9');
  await a.post('/tag/2026-10-12', params, '/tag/2026-10-12');

  const b = new Client(s.base);
  await registerAndSetup(b, 'bert');
  const res = await b.get('/tag/2026-10-12');
  assert.doesNotMatch(res.text, /Geheim/);
  const schedules = await a.get('/einstellungen/arbeitszeit');
  const id = schedules.text.match(/arbeitszeit\/([0-9a-f-]{36})\/bearbeiten/)[1];
  assert.equal((await b.get(`/einstellungen/arbeitszeit/${id}/bearbeiten`)).status, 404);
});
