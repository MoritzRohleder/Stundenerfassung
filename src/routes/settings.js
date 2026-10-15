'use strict';

const express = require('express');
const { parseGeneral, parseSchedule } = require('../services/settings');
const { defaultSchedule, periods } = require('../services/schedules');
const { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } = require('../services/auth');
const { loadContext } = require('../services/overview');
const { vacationYear, trackingYear } = require('../services/vacation');
const { parseDays, formatHM, formatDays } = require('../utils/time');
const { safeReturn } = require('../middleware/security');

function notFound() {
  const err = new Error('Seite nicht gefunden');
  err.status = 404;
  return err;
}

/** Werte eines Nutzers als Formularfelder. */
function generalForm(user) {
  const ot = user.overtime_start_minutes;
  return {
    state: user.state || '',
    tracking_start: user.tracking_start || '',
    overtime_start: ot === null || ot === undefined ? '' : formatHM(Math.abs(ot)),
    overtime_sign: ot < 0 ? 'minus' : 'plus',
    vacation_days_default: user.vacation_days_default === null || user.vacation_days_default === undefined
      ? ''
      : formatDays(user.vacation_days_default),
  };
}

function scheduleForm(schedule) {
  // Neues Modell: Verteilung und Feiertage mit dem üblichen Fall vorbelegt (Spec F9/F10: Standard bleibt wie bisher).
  if (!schedule) return { weekly: '', workdays: [], distribution: 'fixed', holidays_credited: 'ja', valid_from: '', valid_to: '', note: '' };
  return {
    weekly: formatHM(schedule.weekly_min),
    workdays: schedule.workdays,
    distribution: schedule.distribution === 'weekly' ? 'weekly' : 'fixed',
    holidays_credited: schedule.holidays_credited === false ? 'nein' : 'ja',
    valid_from: schedule.valid_from || '',
    valid_to: schedule.valid_to || '',
    note: schedule.note || '',
  };
}

function rawGeneral(body) {
  return {
    state: body.state || '',
    tracking_start: body.tracking_start || '',
    overtime_start: body.overtime_start || '',
    overtime_sign: body.overtime_sign === 'minus' ? 'minus' : 'plus',
    vacation_days_default: body.vacation_days_default || '',
  };
}

function rawSchedule(body) {
  const wd = body.workdays === undefined ? [] : [].concat(body.workdays).map(Number);
  return {
    weekly: body.weekly || '',
    workdays: wd,
    distribution: body.distribution || '',
    holidays_credited: body.holidays_credited || '',
    valid_from: body.valid_from || '',
    valid_to: body.valid_to || '',
    note: body.note || '',
  };
}

function settingsRoutes({ repos, clock }) {
  const router = express.Router();

  // --- Einrichtung nach der Registrierung (F-12) ----------------------------

  router.get('/einrichtung', async (req, res) => {
    const schedules = await repos.workSchedules.forUser(req.user.id);
    res.render('settings/setup', {
      title: 'Einrichtung',
      errors: [],
      general: generalForm(req.user),
      schedule: scheduleForm(defaultSchedule(schedules)),
    });
  });

  router.post('/einrichtung', async (req, res) => {
    const general = parseGeneral(req.body);
    const schedule = parseSchedule(req.body, { isPeriod: false });
    const errors = [...general.errors, ...schedule.errors];
    if (errors.length) {
      return res.status(400).render('settings/setup', {
        title: 'Einrichtung',
        errors,
        general: rawGeneral(req.body),
        schedule: rawSchedule(req.body),
      });
    }
    await repos.transaction(async () => {
      await repos.users.update(req.user.id, { ...general.values, setup_done: true });
      const existing = defaultSchedule(await repos.workSchedules.forUser(req.user.id));
      if (existing) await repos.workSchedules.update(existing.id, schedule.values);
      else await repos.workSchedules.create({ user_id: req.user.id, ...schedule.values });
    });
    req.session.flash = { type: 'success', text: 'Eingerichtet – du kannst jetzt deine Zeiten erfassen.' };
    res.redirect('/');
  });

  // Theme-Umschalter (vor requireSetup nutzbar)
  router.post('/einstellungen/darstellung', async (req, res) => {
    const theme = ['auto', 'light', 'dark'].includes(req.body.theme) ? req.body.theme : 'auto';
    await repos.users.update(req.user.id, { theme });
    if (req.get('X-Requested-With') === 'fetch') return res.json({ theme });
    res.redirect(safeReturn(req.body.back, '/'));
  });

  return router;
}

function settingsPagesRoutes({ repos, clock }) {
  const router = express.Router();

  // --- Allgemeine Einstellungen und Passwort -------------------------------

  async function renderSettings(res, req, { errors = [], general, passwordErrors = [], status = 200 }) {
    res.status(status).render('settings/index', {
      title: 'Einstellungen',
      errors,
      passwordErrors,
      general: general || generalForm(req.user),
      minPassword: MIN_PASSWORD_LENGTH,
    });
  }

  router.get('/einstellungen', (req, res) => renderSettings(res, req, {}));

  router.post('/einstellungen', async (req, res) => {
    const general = parseGeneral(req.body);
    if (general.errors.length) {
      return renderSettings(res, req, { errors: general.errors, general: rawGeneral(req.body), status: 400 });
    }
    await repos.users.update(req.user.id, general.values);
    req.session.flash = { type: 'success', text: 'Einstellungen gespeichert.' };
    res.redirect('/einstellungen');
  });

  router.post('/einstellungen/passwort', async (req, res) => {
    const { current, password, password_repeat: repeat } = req.body;
    const errors = [];
    if (!(await verifyPassword(String(current || ''), req.user.password_hash))) errors.push('Das aktuelle Passwort ist falsch.');
    if (!password || password.length < MIN_PASSWORD_LENGTH) errors.push(`Das neue Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
    else if (password !== repeat) errors.push('Die neuen Passwörter stimmen nicht überein.');
    if (errors.length) return renderSettings(res, req, { passwordErrors: errors, status: 400 });
    await repos.users.update(req.user.id, { password_hash: await hashPassword(password) });
    req.session.flash = { type: 'success', text: 'Passwort geändert.' };
    res.redirect('/einstellungen');
  });

  // --- Arbeitszeitmodelle (F-10, F-11) ----------------------------------

  router.get('/einstellungen/arbeitszeit', async (req, res) => {
    const schedules = await repos.workSchedules.forUser(req.user.id);
    res.render('settings/schedules', {
      title: 'Arbeitszeit',
      standard: defaultSchedule(schedules),
      periods: periods(schedules),
      today: clock.today(),
    });
  });

  function renderScheduleForm(res, { schedule, form, errors = [], isPeriod, status = 200 }) {
    res.status(status).render('settings/schedule-form', {
      title: isPeriod ? 'Zeitraum' : 'Standard-Arbeitszeit',
      schedule,
      form,
      errors,
      isPeriod,
    });
  }

  router.get('/einstellungen/arbeitszeit/neu', (req, res) => {
    renderScheduleForm(res, { schedule: null, form: scheduleForm(null), isPeriod: true });
  });

  router.post('/einstellungen/arbeitszeit/neu', async (req, res) => {
    const schedules = await repos.workSchedules.forUser(req.user.id);
    const parsed = parseSchedule(req.body, { isPeriod: true, schedules });
    if (parsed.errors.length) {
      return renderScheduleForm(res, { schedule: null, form: rawSchedule(req.body), errors: parsed.errors, isPeriod: true, status: 400 });
    }
    await repos.workSchedules.create({ user_id: req.user.id, ...parsed.values });
    req.session.flash = { type: 'success', text: 'Zeitraum angelegt.' };
    res.redirect('/einstellungen/arbeitszeit');
  });

  router.get('/einstellungen/arbeitszeit/:id/bearbeiten', async (req, res) => {
    const schedule = await repos.workSchedules.find(req.user.id, req.params.id);
    if (!schedule) throw notFound();
    renderScheduleForm(res, { schedule, form: scheduleForm(schedule), isPeriod: Boolean(schedule.valid_from) });
  });

  router.post('/einstellungen/arbeitszeit/:id/bearbeiten', async (req, res) => {
    const schedule = await repos.workSchedules.find(req.user.id, req.params.id);
    if (!schedule) throw notFound();
    const isPeriod = Boolean(schedule.valid_from);
    const schedules = await repos.workSchedules.forUser(req.user.id);
    const parsed = parseSchedule(req.body, { isPeriod, schedules, id: schedule.id });
    if (parsed.errors.length) {
      return renderScheduleForm(res, { schedule, form: rawSchedule(req.body), errors: parsed.errors, isPeriod, status: 400 });
    }
    await repos.workSchedules.update(schedule.id, parsed.values);
    req.session.flash = { type: 'success', text: 'Arbeitszeit gespeichert.' };
    res.redirect('/einstellungen/arbeitszeit');
  });

  router.post('/einstellungen/arbeitszeit/:id/loeschen', async (req, res) => {
    const schedule = await repos.workSchedules.find(req.user.id, req.params.id);
    if (!schedule) throw notFound();
    if (!schedule.valid_from) {
      req.session.flash = { type: 'error', text: 'Das Standardmodell kann nicht gelöscht werden.' };
    } else {
      await repos.workSchedules.remove(schedule.id);
      req.session.flash = { type: 'success', text: 'Zeitraum gelöscht.' };
    }
    res.redirect('/einstellungen/arbeitszeit');
  });

  // --- Urlaubsansprüche je Jahr (F-13) -------------------------------------

  async function urlaubView(req) {
    const ctx = await loadContext(repos, req.user, clock.today());
    const first = trackingYear(req.user);
    const last = Math.max(Number(clock.today().slice(0, 4)) + 1, first);
    const years = [];
    for (let y = first; y <= last; y++) {
      const ent = ctx.entitlements.find((e) => e.year === y) || null;
      years.push({ year: y, ent, account: vacationYear(ctx, y) });
    }
    return years;
  }

  router.get('/einstellungen/urlaub', async (req, res) => {
    res.render('settings/vacation', { title: 'Urlaub', years: await urlaubView(req), errors: [], raw: null });
  });

  router.post('/einstellungen/urlaub', async (req, res) => {
    const years = await urlaubView(req);
    const errors = [];
    const changes = [];
    for (const { year, ent } of years) {
      const daysRaw = String(req.body[`days_${year}`] || '').trim();
      const carryRaw = String(req.body[`carry_${year}`] || '').trim();
      const days = daysRaw === '' ? null : parseDays(daysRaw);
      const carry = carryRaw === '' ? null : parseDays(carryRaw);
      if (daysRaw !== '' && days === null) errors.push(`${year}: Anspruch bitte in ganzen oder halben Tagen.`);
      if (carryRaw !== '' && carry === null) errors.push(`${year}: Übertrag bitte in ganzen oder halben Tagen.`);
      changes.push({ year, ent, days, carry });
    }
    if (errors.length) {
      return res.status(400).render('settings/vacation', { title: 'Urlaub', years, errors, raw: req.body });
    }
    await repos.transaction(async () => {
      for (const { year, ent, days, carry } of changes) {
        if (days === null && carry === null) {
          if (ent) await repos.vacationEntitlements.remove(ent.id);
        } else if (ent) {
          await repos.vacationEntitlements.update(ent.id, { days, carryover_days: carry });
        } else {
          await repos.vacationEntitlements.create({ user_id: req.user.id, year, days, carryover_days: carry });
        }
      }
    });
    req.session.flash = { type: 'success', text: 'Urlaubsansprüche gespeichert.' };
    res.redirect('/einstellungen/urlaub');
  });

  return router;
}

module.exports = { settingsRoutes, settingsPagesRoutes };
