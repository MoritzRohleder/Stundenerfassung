'use strict';

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { MONTHS, WEEKDAYS_SHORT, formatDE, formatDEShort, isoWeek, toISO, daysInMonth, startOfWeek, addDays } = require('../utils/date');
const { formatHM, formatDec, formatSignedHM, formatSignedDec, formatClock, formatDays } = require('../utils/time');
const { monthView, yearView } = require('./overview');
const { ABSENCE_TYPES, showsDaySoll, showsDaySaldo, isOffDay, holidayText, summarize } = require('./worktime');
const { STATES } = require('./holidays');
const { periods, defaultSchedule } = require('./schedules');

// Berichte für Excel und PDF (Spec F-41). Einheit sind ganze Monate von … bis.

const MAX_MONTHS = 120;

/** Monate zwischen zwei "JJJJ-MM" (einschließlich) oder null bei ungültiger Angabe. */
function monthRange(from, to) {
  const re = /^(\d{4})-(\d{2})$/;
  const a = re.exec(from || '');
  const b = re.exec(to || '');
  if (!a || !b) return null;
  let y = Number(a[1]);
  let m = Number(a[2]);
  const ey = Number(b[1]);
  const em = Number(b[2]);
  if (m < 1 || m > 12 || em < 1 || em > 12 || y * 12 + m > ey * 12 + em) return null;
  const list = [];
  while (y * 12 + m <= ey * 12 + em) {
    list.push({ year: y, month: m });
    if (list.length > MAX_MONTHS) return null;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return list;
}


function absenceText(r) {
  if (!r.absenceType) return '';
  const label = ABSENCE_TYPES[r.absenceType].label;
  return r.absenceFraction === 0.5 ? `½ ${label}` : label;
}

function blocksText(r) {
  return r.blocks.map((b) => `${formatClock(b.start_min)}–${formatClock(b.end_min)}`).join(', ');
}

function breakText(r) {
  if (!r.breakSource) return '';
  return `${r.breakMin} min${r.breakSource === 'auto' ? ' (auto)' : ''}`;
}

function rangeLabel(months) {
  const first = months[0];
  const last = months[months.length - 1];
  const f = `${MONTHS[first.month - 1]} ${first.year}`;
  const l = `${MONTHS[last.month - 1]} ${last.year}`;
  return f === l ? f : `${f} – ${l}`;
}

function buildReport(ctx, months) {
  return {
    user: ctx.user,
    label: rangeLabel(months),
    months: months.map(({ year, month }) => monthView(ctx, year, month)),
    years: [...new Set(months.map((m) => m.year))].map((y) => yearView(ctx, y)),
  };
}

function fileBase(months) {
  const first = months[0];
  const last = months[months.length - 1];
  const p = (m) => `${m.year}-${String(m.month).padStart(2, '0')}`;
  return `stundenerfassung_${p(first)}${months.length > 1 ? `_bis_${p(last)}` : ''}`;
}

function scheduleText(s) {
  const days = s.workdays.map((d) => WEEKDAYS_SHORT[d - 1]).join(', ');
  const parts = [`${formatHM(s.weekly_min)} h/Woche`, s.distribution === 'weekly' ? `Wochensoll (übliche Tage ${days})` : days];
  if (s.holidays_credited === false) parts.push('Feiertage nicht angerechnet');
  return parts.join(', ');
}

// --- Excel -------------------------------------------------------------------

const DUR_FMT = '[h]:mm';
const DEC_FMT = '0.00';

function excelDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function excelReport(ctx, months) {
  const report = buildReport(ctx, months);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Stundenerfassung';
  wb.created = new Date();

  // Tage
  const ws = wb.addWorksheet('Tage', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Datum', key: 'date', width: 11, style: { numFmt: 'dd.mm.yyyy' } },
    { header: 'Tag', key: 'wd', width: 5 },
    { header: 'KW', key: 'kw', width: 5 },
    { header: 'Zeiten', key: 'blocks', width: 28 },
    { header: 'Pause (min)', key: 'pause', width: 11 },
    { header: 'Pause-Art', key: 'pauseType', width: 11 },
    { header: 'Ist', key: 'ist', width: 9, style: { numFmt: DUR_FMT } },
    { header: 'Ist (h)', key: 'istDec', width: 9, style: { numFmt: DEC_FMT } },
    { header: 'Soll', key: 'soll', width: 9, style: { numFmt: DUR_FMT } },
    { header: 'Soll (h)', key: 'sollDec', width: 9, style: { numFmt: DEC_FMT } },
    { header: 'Saldo', key: 'saldo', width: 9 },
    { header: 'Saldo (h)', key: 'saldoDec', width: 10, style: { numFmt: '+0.00;-0.00;0.00' } },
    { header: 'Abwesenheit', key: 'absence', width: 22 },
    { header: 'Feiertag', key: 'holiday', width: 24 },
    { header: 'Hinweise', key: 'hints', width: 34 },
    { header: 'Notiz', key: 'note', width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  const breakTypes = { auto: 'automatisch', manual: 'manuell', gaps: 'Lücken' };
  for (const mv of report.months) {
    for (const row of mv.rows) {
      if (row.kind === 'week') continue;
      const saldo = showsDaySaldo(row);
      const r = ws.addRow({
        date: excelDate(row.date),
        wd: WEEKDAYS_SHORT[row.weekday - 1],
        kw: isoWeek(row.date).week,
        blocks: blocksText(row),
        pause: row.breakSource ? row.breakMin : null,
        pauseType: row.breakSource ? breakTypes[row.breakSource] : '',
        ist: row.blocks.length ? row.ist / 1440 : null,
        istDec: row.blocks.length ? Math.round((row.ist / 60) * 100) / 100 : null,
        soll: showsDaySoll(row) ? row.soll / 1440 : null,
        sollDec: showsDaySoll(row) ? Math.round((row.soll / 60) * 100) / 100 : null,
        saldo: saldo ? formatSignedHM(row.saldo).replace('−', '-') : '',
        saldoDec: saldo ? Math.round((row.saldo / 60) * 100) / 100 : null,
        absence: absenceText(row),
        holiday: holidayText(row),
        hints: row.hints.join('; '),
        note: row.note,
      });
      if (isOffDay(row)) r.font = { color: { argb: 'FF64748B' } };
    }
  }
  ws.autoFilter = { from: 'A1', to: 'P1' };

  // Monate
  const ms = wb.addWorksheet('Monate', { views: [{ state: 'frozen', ySplit: 1 }] });
  ms.columns = [
    { header: 'Monat', key: 'month', width: 16 },
    { header: 'Ist', key: 'ist', width: 10, style: { numFmt: DUR_FMT } },
    { header: 'Ist (h)', key: 'istDec', width: 10, style: { numFmt: DEC_FMT } },
    { header: 'Soll', key: 'soll', width: 10, style: { numFmt: DUR_FMT } },
    { header: 'Soll (h)', key: 'sollDec', width: 10, style: { numFmt: DEC_FMT } },
    { header: 'Saldo (h)', key: 'saldoDec', width: 10, style: { numFmt: '+0.00;-0.00;0.00' } },
    { header: 'Konto Monatsende (h)', key: 'overtime', width: 20, style: { numFmt: '+0.00;-0.00;0.00' } },
    { header: 'Urlaub (Tage)', key: 'vac', width: 13 },
    { header: 'Krank (Tage)', key: 'sick', width: 13 },
    { header: 'Freizeitausgleich (Tage)', key: 'comp', width: 22 },
  ];
  ms.getRow(1).font = { bold: true };
  const dec = (min) => Math.round((min / 60) * 100) / 100;
  for (const mv of report.months) {
    const s = mv.summary;
    ms.addRow({
      month: `${MONTHS[mv.month - 1]} ${mv.year}`,
      ist: s.ist / 1440,
      istDec: dec(s.ist),
      soll: s.soll / 1440,
      sollDec: dec(s.soll),
      saldoDec: dec(s.saldo),
      overtime: mv.overtimeEnd === null ? null : dec(mv.overtimeEnd),
      vac: s.vacationDays,
      sick: s.sickDays,
      comp: s.compDays,
    });
  }

  // Wochen (ganze ISO-Wochen, am Rand auf den Zeitraum gekürzt)
  const wk = wb.addWorksheet('Wochen', { views: [{ state: 'frozen', ySplit: 1 }] });
  wk.columns = [
    { header: 'KW', key: 'kw', width: 9 },
    { header: 'Von', key: 'from', width: 11, style: { numFmt: 'dd.mm.yyyy' } },
    { header: 'Bis', key: 'to', width: 11, style: { numFmt: 'dd.mm.yyyy' } },
    { header: 'Ist', key: 'ist', width: 10, style: { numFmt: DUR_FMT } },
    { header: 'Ist (h)', key: 'istDec', width: 10, style: { numFmt: DEC_FMT } },
    { header: 'Soll', key: 'soll', width: 10, style: { numFmt: DUR_FMT } },
    { header: 'Soll (h)', key: 'sollDec', width: 10, style: { numFmt: DEC_FMT } },
    { header: 'Saldo (h)', key: 'saldoDec', width: 10, style: { numFmt: '+0.00;-0.00;0.00' } },
  ];
  wk.getRow(1).font = { bold: true };
  const rangeFrom = toISO(months[0].year, months[0].month, 1);
  const last = months[months.length - 1];
  const rangeTo = toISO(last.year, last.month, daysInMonth(last.year, last.month));
  for (let monday = startOfWeek(rangeFrom); monday <= rangeTo; monday = addDays(monday, 7)) {
    const from = monday < rangeFrom ? rangeFrom : monday;
    const sunday = addDays(monday, 6);
    const to = sunday > rangeTo ? rangeTo : sunday;
    const w = summarize(ctx, from, to);
    const { year, week } = isoWeek(monday);
    wk.addRow({
      kw: `${year}-${String(week).padStart(2, '0')}`,
      from: excelDate(from),
      to: excelDate(to),
      ist: w.ist / 1440,
      istDec: dec(w.ist),
      soll: w.soll / 1440,
      sollDec: dec(w.soll),
      saldoDec: dec(w.saldo),
    });
  }

  // Info
  const info = wb.addWorksheet('Info');
  info.columns = [{ key: 'k', width: 28 }, { key: 'v', width: 50 }];
  const std = defaultSchedule(ctx.schedules);
  const rows = [
    ['Nutzer', ctx.user.username],
    ['Zeitraum', report.label],
    ['Erstellt am', formatDE(ctx.today)],
    ['Bundesland', STATES[ctx.user.state] || ''],
    ['Beginn der Erfassung', ctx.user.tracking_start ? formatDE(ctx.user.tracking_start) : ''],
    ['Startsaldo Überstunden', `${formatSignedHM(ctx.user.overtime_start_minutes || 0)} h`],
    ['Standardmodell', std ? scheduleText(std) : ''],
    ...periods(ctx.schedules).map((p) => [
      `Zeitraum ab ${formatDE(p.valid_from)}`,
      `bis ${p.valid_to ? formatDE(p.valid_to) : 'auf Weiteres'}: ${scheduleText(p)}`,
    ]),
    [],
    ['Hinweis', 'Ist und Soll als Excel-Dauer [h]:mm und dezimal; Saldo zählt nur abgelaufene Tage. Beim Wochensoll stehen Soll und Saldo im Blatt „Wochen“.'],
  ];
  for (const r of rows) info.addRow({ k: r[0], v: r[1] });
  info.getColumn('k').font = { bold: true };

  return { buffer: await wb.xlsx.writeBuffer(), filename: `${fileBase(months)}.xlsx` };
}

// --- PDF ---------------------------------------------------------------------

// Die Standardschrift Helvetica kennt kein echtes Minuszeichen.
function pdfText(s) {
  return String(s ?? '').replace(/−/g, '-');
}

const COLS = [
  { key: 'date', title: 'Datum', width: 52 },
  { key: 'blocks', title: 'Zeiten', width: 120 },
  { key: 'pause', title: 'Pause', width: 60, align: 'right' },
  { key: 'ist', title: 'Ist', width: 42, align: 'right' },
  { key: 'soll', title: 'Soll', width: 42, align: 'right' },
  { key: 'saldo', title: 'Saldo', width: 46, align: 'right' },
  { key: 'gap', title: '', width: 8 },
  { key: 'info', title: 'Info', width: 145 },
];

function pdfReport(ctx, months) {
  const report = buildReport(ctx, months);
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Stundennachweis ${report.label}`, Author: ctx.user.username } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
  const GREY = '#64748b';
  const PRIMARY = '#4338ca';

  function header(title, subtitle) {
    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(15).text(pdfText(title), left, 40);
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(pdfText(subtitle));
    doc.moveDown(0.8);
  }

  function tableHeader() {
    const y = doc.y;
    let x = left;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
    for (const c of COLS) {
      doc.text(c.title, x + 2, y, { width: c.width - 4, align: c.align || 'left' });
      x += c.width;
    }
    doc.moveTo(left, y + 12).lineTo(left + 515, y + 12).strokeColor('#999').lineWidth(0.5).stroke();
    doc.y = y + 15;
  }

  function row(cells, { bold = false, shade = null, color = '#000' } = {}) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const heights = COLS.map((c) => doc.heightOfString(pdfText(cells[c.key] || ' '), { width: c.width - 4 }));
    const h = Math.max(...heights) + 4;
    if (doc.y + h > bottom()) {
      doc.addPage();
      doc.y = 40;
      tableHeader();
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    }
    const y = doc.y;
    if (shade) doc.rect(left, y - 1, 515, h).fill(shade);
    let x = left;
    for (const c of COLS) {
      doc.fillColor(color).text(pdfText(cells[c.key] || ''), x + 2, y + 1, { width: c.width - 4, align: c.align || 'left' });
      x += c.width;
    }
    doc.y = y + h;
  }

  const dur = (min) => `${formatHM(min)} h`;
  const signed = (min) => `${formatSignedHM(min)} h`;

  report.months.forEach((mv, idx) => {
    if (idx > 0) doc.addPage();
    const s = mv.summary;
    header(
      `Stundennachweis ${MONTHS[mv.month - 1]} ${mv.year}`,
      `${ctx.user.username} · ${STATES[ctx.user.state] || ''} · erstellt am ${formatDE(ctx.today)}`,
    );
    doc.font('Helvetica').fontSize(9).fillColor('#000');
    const summaryLine = [
      `Ist: ${dur(s.ist)} (${formatDec(s.ist)} h)`,
      `Soll: ${dur(s.soll)} (${formatDec(s.soll)} h)`,
      `Saldo: ${signed(s.saldo)} (${formatSignedDec(s.saldo)} h)`,
      mv.overtimeEnd === null ? null : `Konto am Monatsende: ${signed(mv.overtimeEnd)}`,
    ].filter(Boolean).join('   ·   ');
    doc.text(pdfText(summaryLine), left);
    doc.text(pdfText(`Urlaub: ${formatDays(s.vacationDays)} Tage   ·   Krank: ${formatDays(s.sickDays)} Tage${s.compDays ? `   ·   Freizeitausgleich: ${formatDays(s.compDays)} Tage` : ''}`));
    doc.moveDown(0.8);
    tableHeader();

    for (const r of mv.rows) {
      if (r.kind === 'week') {
        row(
          { date: `KW ${r.week}${r.partial ? ' (Teil)' : ''}`, ist: dur(r.ist), soll: dur(r.soll), saldo: signed(r.saldo) },
          { bold: true, shade: '#eef2ff' },
        );
        continue;
      }
      const info = [holidayText(r), absenceText(r), ...r.hints.map((h) => `Hinweis: ${h}`), r.note].filter(Boolean).join(' · ');
      const off = isOffDay(r);
      row(
        {
          date: `${WEEKDAYS_SHORT[r.weekday - 1]} ${formatDEShort(r.date)}`,
          blocks: blocksText(r),
          pause: breakText(r),
          ist: r.blocks.length ? dur(r.ist) : '',
          soll: showsDaySoll(r) ? dur(r.soll) : r.weekly && r.soll ? 'W' : '',
          saldo: showsDaySaldo(r) ? signed(r.saldo) : '',
          info,
        },
        { shade: off ? '#f1f5f9' : null, color: off ? GREY : '#000' },
      );
    }
    doc.moveTo(left, doc.y).lineTo(left + 515, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
    doc.y += 3;
    row({ date: 'Monat', ist: dur(s.ist), soll: dur(s.soll), saldo: signed(s.saldo) }, { bold: true });
  });

  // Jahresübersicht(en), wenn mehr als ein Monat exportiert wird
  if (report.months.length > 1) {
    for (const yv of report.years) {
      doc.addPage();
      header(`Jahresübersicht ${yv.year}`, `${ctx.user.username} · erstellt am ${formatDE(ctx.today)}`);
      const cols = [
        ['Monat', 90, 'left'], ['Ist', 70, 'right'], ['Soll', 70, 'right'], ['Saldo', 70, 'right'],
        ['Konto Monatsende', 95, 'right'], ['Urlaub', 55, 'right'], ['Krank', 55, 'right'],
      ];
      const line = (vals, bold) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000');
        const y = doc.y;
        let x = left;
        vals.forEach((v, i) => {
          doc.text(pdfText(v), x + 2, y, { width: cols[i][1] - 4, align: cols[i][2] });
          x += cols[i][1];
        });
        doc.y = y + 15;
      };
      line(cols.map((c) => c[0]), true);
      for (const m of yv.months) {
        line([
          MONTHS[m.month - 1], dur(m.ist), dur(m.soll), m.isFuture ? '' : signed(m.saldo),
          m.overtimeEnd === null ? '' : signed(m.overtimeEnd),
          m.vacationDays ? formatDays(m.vacationDays) : '', m.sickDays ? formatDays(m.sickDays) : '',
        ]);
      }
      const t = yv.total;
      line(['Summe', dur(t.ist), dur(t.soll), signed(t.saldo), yv.overtimeEnd === null ? '' : signed(yv.overtimeEnd), formatDays(t.vacationDays), formatDays(t.sickDays)], true);
      if (yv.vacation) {
        const v = yv.vacation;
        doc.moveDown(1).font('Helvetica').fontSize(9).text(
          pdfText(`Urlaub ${yv.year}: Anspruch ${formatDays(v.entitlement)} + Übertrag ${formatDays(v.carryover)} - genommen ${formatDays(v.taken)} = Rest ${formatDays(v.rest)} Tage`),
          left,
        );
      }
    }
  }

  // Seitenzahlen
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Fußzeile liegt im unteren Rand: Rand kurz aufheben, sonst bricht pdfkit auf eine neue Seite um
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor(GREY).text(
      `Stundenerfassung · ${pdfText(report.label)} · Seite ${i + 1} von ${range.count}`,
      left,
      doc.page.height - margin + 14,
      { width: 515, align: 'center', lineBreak: false },
    );
    doc.page.margins.bottom = margin;
  }
  doc.end();
  return done.then((buffer) => ({ buffer, filename: `${fileBase(months)}.pdf` }));
}

module.exports = { monthRange, excelReport, pdfReport };
