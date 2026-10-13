'use strict';

const express = require('express');
const { isValidISO, addDays, parseDateInput, eachDay, diffDays } = require('../utils/date');
const { formatClock } = require('../utils/time');
const { loadContext, monthView, yearView, dashboardView } = require('../services/overview');
const { dayResult, hasTarget, modelTarget } = require('../services/worktime');
const { parseDayForm, saveDay, clearDay } = require('../services/dayEntry');
const { vacationYear } = require('../services/vacation');
const { safeReturn } = require('../middleware/security');

function notFound() {
  const err = new Error('Seite nicht gefunden');
  err.status = 404;
  return err;
}

function rowsFromBlocks(blocks) {
  return blocks.map((b) => ({ start: formatClock(b.start_min), end: formatClock(b.end_min) }));
}

function mainRoutes({ repos, clock }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const ctx = await loadContext(repos, req.user, clock.today());
    res.render('dashboard', { title: 'Übersicht', view: dashboardView(ctx) });
  });

  // --- Tag ---------------------------------------------------------------

  function renderDay(res, ctx, date, { input, errors = [], status = 200, back }) {
    const result = dayResult(ctx, date);
    const rows = input ? input.rows.filter((r) => r.start || r.end) : rowsFromBlocks(result.blocks);
    rows.push({ start: '', end: '' });
    const form = input || {
      manual_break: result.day && result.day.manual_break_min !== null && result.day.manual_break_min !== undefined
        ? String(result.day.manual_break_min)
        : '',
      absence_type: result.absenceType || '',
      absence_fraction: result.absenceFraction === 0.5 ? '0.5' : '1',
      note: result.note,
    };
    res.status(status).render('day', {
      title: 'Tag erfassen',
      date,
      result,
      rows,
      form,
      errors,
      back,
      prev: addDays(date, -1),
      next: addDays(date, 1),
      canHaveAbsence: hasTarget(ctx, date),
      modelTarget: modelTarget(ctx, date),
      vacation: vacationYear(ctx, Number(date.slice(0, 4))),
    });
  }

  router.get('/heute', (req, res) => res.redirect(`/tag/${clock.today()}`));

  router.get('/tag/:date', async (req, res) => {
    const { date } = req.params;
    if (!isValidISO(date)) throw notFound();
    const ctx = await loadContext(repos, req.user, clock.today());
    renderDay(res, ctx, date, { back: safeReturn(req.query.zurueck, `/monat/${date.slice(0, 4)}/${Number(date.slice(5, 7))}`) });
  });

  router.post('/tag/:date', async (req, res) => {
    const { date } = req.params;
    if (!isValidISO(date)) throw notFound();
    const back = safeReturn(req.body.back, `/monat/${date.slice(0, 4)}/${Number(date.slice(5, 7))}`);
    const ctx = await loadContext(repos, req.user, clock.today());
    const parsed = parseDayForm(req.body, ctx, date);
    if (parsed.errors.length) {
      return renderDay(res, ctx, date, { input: parsed.input, errors: parsed.errors, status: 400, back });
    }
    await saveDay(repos, req.user.id, date, parsed.blocks, parsed.day);
    req.session.flash = { type: 'success', text: 'Gespeichert.' };
    if (req.body.action === 'next') return res.redirect(`/tag/${addDays(date, 1)}?zurueck=${encodeURIComponent(back)}`);
    if (req.body.action === 'back') return res.redirect(back);
    res.redirect(`/tag/${date}?zurueck=${encodeURIComponent(back)}`);
  });

  router.post('/tag/:date/loeschen', async (req, res) => {
    const { date } = req.params;
    if (!isValidISO(date)) throw notFound();
    await clearDay(repos, req.user.id, date);
    req.session.flash = { type: 'success', text: 'Der Tag wurde geleert.' };
    res.redirect(safeReturn(req.body.back, `/tag/${date}`));
  });

  // --- Abwesenheit für einen Zeitraum (F-26) -------------------------------

  const RANGE_TYPES = ['vacation', 'sick', 'other_paid', 'comp_time'];

  router.get('/abwesenheit/neu', (req, res) => {
    res.render('absence', { title: 'Abwesenheit eintragen', errors: [], form: { from: '', to: '', absence_type: 'vacation' } });
  });

  router.post('/abwesenheit/neu', async (req, res) => {
    const form = {
      from: String(req.body.from || ''),
      to: String(req.body.to || ''),
      absence_type: RANGE_TYPES.includes(req.body.absence_type) ? req.body.absence_type : 'vacation',
    };
    const from = parseDateInput(form.from);
    const to = parseDateInput(form.to);
    const errors = [];
    if (!from || !to) errors.push('Bitte Start- und Enddatum angeben.');
    else if (to < from) errors.push('Das Enddatum liegt vor dem Startdatum.');
    else if (diffDays(from, to) > 366) errors.push('Der Zeitraum darf höchstens ein Jahr lang sein.');
    if (errors.length) return res.status(400).render('absence', { title: 'Abwesenheit eintragen', errors, form });

    const ctx = await loadContext(repos, req.user, clock.today());
    const targets = eachDay(from, to).filter((d) => hasTarget(ctx, d));
    await repos.transaction(async () => {
      for (const date of targets) {
        const existing = await repos.days.find(req.user.id, date);
        const changes = { absence_type: form.absence_type, absence_fraction: 1 };
        if (existing) await repos.days.update(existing.id, changes);
        else await repos.days.create({ user_id: req.user.id, date, manual_break_min: null, note: '', ...changes });
      }
    });
    const skipped = diffDays(from, to) + 1 - targets.length;
    req.session.flash = {
      type: 'success',
      text: `${targets.length} Arbeitstag(e) eingetragen${skipped ? `, ${skipped} freie Tag(e) übersprungen` : ''}.`,
    };
    res.redirect(`/monat/${from.slice(0, 4)}/${Number(from.slice(5, 7))}`);
  });

  // --- Monat und Jahr --------------------------------------------------------

  router.get('/monat', (req, res) => {
    const today = clock.today();
    res.redirect(`/monat/${today.slice(0, 4)}/${Number(today.slice(5, 7))}`);
  });

  router.get('/monat/:year/:month', async (req, res) => {
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    if (!/^\d{4}$/.test(req.params.year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1900 || year > 2200) {
      throw notFound();
    }
    const ctx = await loadContext(repos, req.user, clock.today());
    res.render('month', { title: 'Monatsübersicht', view: monthView(ctx, year, month), currentPath: req.originalUrl });
  });

  router.get('/jahr', (req, res) => res.redirect(`/jahr/${clock.today().slice(0, 4)}`));

  router.get('/jahr/:year', async (req, res) => {
    if (req.query.j && /^\d{4}$/.test(req.query.j)) return res.redirect(`/jahr/${req.query.j}`);
    if (!/^\d{4}$/.test(req.params.year)) throw notFound();
    const year = Number(req.params.year);
    if (year < 1900 || year > 2200) throw notFound();
    const ctx = await loadContext(repos, req.user, clock.today());
    res.render('year', { title: `Jahresübersicht ${year}`, view: yearView(ctx, year) });
  });

  return router;
}

module.exports = { mainRoutes };
