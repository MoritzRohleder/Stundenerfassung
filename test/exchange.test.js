'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { Client, start, registerAndSetup } = require('./helpers');
const { parseImport } = require('../src/services/exchange');
const { monthRange } = require('../src/services/report');

async function addDay(c, date, blocks, extra = {}) {
  const p = new URLSearchParams({ action: 'stay', ...extra });
  for (const [s, e] of blocks) {
    p.append('start', s);
    p.append('end', e);
  }
  const res = await c.post(`/tag/${date}`, p, `/tag/${date}`);
  assert.equal(res.status, 302, `Tag ${date} gespeichert`);
}

async function seed(c) {
  await registerAndSetup(c);
  await addDay(c, '2026-10-05', [['8', '16:45']]);
  await addDay(c, '2026-10-06', [['8', '16:45']], { manual_break: '45', note: 'Kundentermin' });
  await addDay(c, '2026-10-07', [['7:30', '12'], ['12:45', '16']]);
  await addDay(c, '2026-10-08', [['8', '12']], { absence_type: 'vacation', absence_fraction: '0.5' });
  await addDay(c, '2026-10-09', [], { absence_type: 'sick', absence_fraction: '1' });
  const period = new URLSearchParams({ valid_from: '01.02.2027', valid_to: '', weekly: '20' });
  for (const d of ['1', '2', '3']) period.append('workdays', d);
  assert.equal((await c.post('/einstellungen/arbeitszeit/neu', period, '/einstellungen/arbeitszeit/neu')).status, 302);
  assert.equal((await c.post('/einstellungen/urlaub', { days_2026: '12,5', carry_2027: '3' })).status, 302);
}

function withoutMeta(json) {
  const { exported_at: _e, username: _u, ...rest } = json;
  return rest;
}

test('monthRange', () => {
  assert.equal(monthRange('2026-10', '2026-10').length, 1);
  assert.equal(monthRange('2026-11', '2027-02').length, 4);
  assert.equal(monthRange('2026-10', '2026-09'), null);
  assert.equal(monthRange('2026-13', '2027-01'), null);
  assert.equal(monthRange('2000-01', '2030-01'), null, 'höchstens 10 Jahre');
});

test('Sicherung exportieren und auf neuem Konto wieder einspielen', async (t) => {
  const s = await start('2026-10-14');
  t.after(() => s.stop());
  const a = new Client(s.base);
  await seed(a);

  const dl = await a.download('/daten/sicherung');
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /stundenerfassung_sicherung_anna_2026-10-14\.json/);
  const backup = JSON.parse(dl.buffer.toString('utf8'));
  assert.equal(backup.format, 'stundenerfassung-export');
  assert.equal(backup.days.length, 5);
  assert.deepEqual(backup.days[2].blocks, [{ start: '07:30', end: '12:00' }, { start: '12:45', end: '16:00' }]);
  assert.equal(backup.days[1].manual_break_min, 45);
  assert.equal(backup.work_schedules.length, 2);

  // Neues Konto: Import direkt statt Einrichtung
  const b = new Client(s.base);
  await b.post('/registrieren', { username: 'bert', password: 'geheim123', password_repeat: 'geheim123' }, '/registrieren');
  const page = await b.get('/einrichtung');
  assert.match(page.text, /Sicherung importieren/);
  const res = await b.upload('/daten/import', {}, { name: 'sicherung.json', content: dl.buffer });
  assert.equal(res.status, 302);
  assert.equal(res.location, '/');
  assert.equal((await b.get('/')).status, 200, 'Einrichtung gilt als erledigt');

  const again = JSON.parse((await b.download('/daten/sicherung')).buffer.toString('utf8'));
  assert.deepEqual(withoutMeta(again), withoutMeta(backup), 'Rundreise ohne Verlust');
});

test('Import „nur Tage“ überschreibt gleiche Tage und lässt den Rest', async (t) => {
  const s = await start('2026-10-14');
  t.after(() => s.stop());
  const c = new Client(s.base);
  await seed(c);
  const backup = JSON.parse((await c.download('/daten/sicherung')).buffer.toString('utf8'));
  const file = {
    ...backup,
    days: [{ date: '2026-10-05', blocks: [{ start: '09:00', end: '13:00' }], manual_break_min: null, absence_type: null, absence_fraction: null, note: 'neu' },
      { date: '2026-10-12', blocks: [{ start: '08:00', end: '12:00' }], manual_break_min: null, absence_type: null, absence_fraction: null, note: '' }],
    work_schedules: [{ valid_from: null, valid_to: null, weekly_min: 600, workdays: [1], note: '' }],
  };
  const res = await c.upload('/daten/import', { mode: 'days' }, { name: 'tage.json', content: JSON.stringify(file) }, '/daten/import');
  assert.equal(res.status, 302);
  const after = JSON.parse((await c.download('/daten/sicherung')).buffer.toString('utf8'));
  assert.equal(after.days.length, 6);
  assert.equal(after.days.find((d) => d.date === '2026-10-05').note, 'neu');
  assert.equal(after.days.find((d) => d.date === '2026-10-06').note, 'Kundentermin');
  assert.equal(after.work_schedules.length, 2, 'Arbeitszeitmodelle unverändert');
});

test('Import „alles ersetzen“ braucht eine Bestätigung', async (t) => {
  const s = await start('2026-10-14');
  t.after(() => s.stop());
  const c = new Client(s.base);
  await seed(c);
  const backup = (await c.download('/daten/sicherung')).buffer;
  let res = await c.upload('/daten/import', { mode: 'replace' }, { name: 'x.json', content: backup }, '/daten/import');
  assert.equal(res.status, 400);
  assert.match(res.text, /bestätige/);
  res = await c.upload('/daten/import', { mode: 'replace', confirm: 'ja' }, { name: 'x.json', content: backup }, '/daten/import');
  assert.equal(res.status, 302);
});

test('Fehlerhafte Datei wird abgelehnt und nichts übernommen', async (t) => {
  const s = await start('2026-10-14');
  t.after(() => s.stop());
  const c = new Client(s.base);
  await seed(c);
  const backup = JSON.parse((await c.download('/daten/sicherung')).buffer.toString('utf8'));
  backup.days.push({ date: '2026-10-20', blocks: [{ start: '08:00', end: '12:00' }, { start: '11:00', end: '13:00' }] });
  const res = await c.upload('/daten/import', { mode: 'days' }, { name: 'x.json', content: JSON.stringify(backup) }, '/daten/import');
  assert.equal(res.status, 400);
  assert.match(res.text, /überschneiden/);
  const after = JSON.parse((await c.download('/daten/sicherung')).buffer.toString('utf8'));
  assert.equal(after.days.length, 5);

  const notJson = await c.upload('/daten/import', { mode: 'days' }, { name: 'x.json', content: 'kein json' }, '/daten/import');
  assert.match(notJson.text, /keine gültige JSON-Datei/);
});

test('Upload ohne CSRF-Token wird abgelehnt', async (t) => {
  const s = await start('2026-10-14');
  t.after(() => s.stop());
  const c = new Client(s.base);
  await registerAndSetup(c);
  const fd = new FormData();
  fd.set('file', new Blob(['{}']), 'x.json');
  const res = await fetch(`${s.base}/daten/import`, { method: 'POST', headers: { cookie: c.cookie }, body: fd, redirect: 'manual' });
  assert.equal(res.status, 403);
});

test('parseImport prüft Einstellungen und Abwesenheiten', () => {
  const base = {
    format: 'stundenerfassung-export',
    version: 1,
    settings: { state: 'XX', tracking_start: '2026-10-01', overtime_start_minutes: 0, vacation_days_default: 30 },
    work_schedules: [{ valid_from: null, valid_to: null, weekly_min: 2400, workdays: [1, 2, 3, 4, 5] }],
    vacation_entitlements: [],
    days: [{ date: '2026-10-05', blocks: [], absence_type: 'sick', absence_fraction: 0.5 }],
  };
  const { errors } = parseImport(JSON.stringify(base));
  assert.ok(errors.some((e) => /Bundesland/.test(e)));
  assert.ok(errors.some((e) => /nur als ganzen Tag/.test(e)));
  assert.match(parseImport('{"format":"anders"}').errors[0], /keine Sicherungsdatei/);
});

test('Excel- und PDF-Export', async (t) => {
  const s = await start('2026-10-14');
  t.after(() => s.stop());
  const c = new Client(s.base);
  await seed(c);

  const xlsx = await c.download('/daten/export?format=excel&von=2026-10&bis=2026-10');
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers.get('content-disposition'), /stundenerfassung_2026-10\.xlsx/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx.buffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Tage', 'Monate', 'Wochen', 'Info']);
  const tage = wb.getWorksheet('Tage');
  assert.equal(tage.rowCount, 32, 'Kopfzeile + 31 Tage');
  const row7 = tage.getRow(8); // 07.10.
  assert.equal(row7.getCell('D').value, '07:30–12:00, 12:45–16:00');
  assert.equal(row7.getCell('E').value, 45);
  // exceljs liest Zellen im Zeitformat als Datum zurück (Excel-Tag 0 = 30.12.1899)
  const ist = row7.getCell('G').value;
  const istMin = ist instanceof Date ? Math.round((ist.getTime() - Date.UTC(1899, 11, 30)) / 60000) : Math.round(ist * 1440);
  assert.equal(istMin, 465, 'Ist als Excel-Dauer');
  assert.equal(row7.getCell('H').value, 7.75);
  assert.equal(row7.getCell('L').value, -0.25);
  assert.equal(tage.getRow(4).getCell('O').value, 'Tag der Deutschen Einheit');
  // Konto: Startsaldo +2:00, 01./02.10. ohne Eintrag (−16:00), 05.10. +0:15, 06.10. ±0, 07.10. −0:15 → −14:00
  assert.equal(row7.getCell('M').value, -14);
  assert.equal(tage.getRow(2).getCell('M').value, -6, '01.10.: +2:00 − 8:00');
  assert.equal(wb.getWorksheet('Monate').getRow(2).getCell('A').value, 'Oktober 2026');

  const pdf = await c.download('/daten/export?format=pdf&von_m=9&von_j=2026&bis_m=12&bis_j=2026');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.buffer.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdf.headers.get('content-disposition'), /2026-09_bis_2026-12\.pdf/);

  assert.equal((await c.download('/daten/export?format=pdf&von=2026-12&bis=2026-01')).status, 400);
  assert.equal((await c.download('/daten/export?format=doc&von=2026-01&bis=2026-01')).status, 400);
});
