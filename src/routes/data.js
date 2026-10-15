'use strict';

const express = require('express');
const multer = require('multer');
const { loadContext, availableYears } = require('../services/overview');
const { monthRange, excelReport, pdfReport } = require('../services/report');
const { buildExport, parseImport, applyImport } = require('../services/exchange');
const { verifyCsrf } = require('../middleware/security');

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 10 } });

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function attachment(res, filename, type, buffer) {
  res.set('Content-Type', type);
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

/** Import: auch vor der Einrichtung erreichbar (Sicherung auf neuem Server einspielen). */
function importRoutes({ repos, appVersion }) {
  const router = express.Router();

  function renderImport(req, res, { errors = [], status = 200 } = {}) {
    res.status(status).render('data/import', { title: 'Import', errors, setupDone: Boolean(req.user.setup_done) });
  }

  router.get('/daten/import', (req, res) => renderImport(req, res));

  router.post('/daten/import', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Die Datei ist zu groß (höchstens 10 MB).' : 'Die Datei konnte nicht gelesen werden.';
        return renderImport(req, res, { errors: [msg], status: 400 });
      }
      // Der CSRF-Token steht im Multipart-Formular und ist erst jetzt gelesen.
      const csrfErr = verifyCsrf(req);
      if (csrfErr) return next(csrfErr);
      return handleImport(req, res).catch(next);
    });
  });

  async function handleImport(req, res) {
    if (!req.file) return renderImport(req, res, { errors: ['Bitte eine Datei auswählen.'], status: 400 });
    const mode = req.user.setup_done && req.body.mode === 'days' ? 'days' : 'replace';
    if (mode === 'replace' && req.user.setup_done && req.body.confirm !== 'ja') {
      return renderImport(req, res, { errors: ['Bitte bestätige, dass alle bisherigen Daten ersetzt werden.'], status: 400 });
    }
    const { errors, data } = parseImport(req.file.buffer.toString('utf8'));
    if (errors.length) return renderImport(req, res, { errors, status: 400 });

    // Den alten Stand hält die Speicherschicht ohnehin als Sicherungskopie in data/backup/.
    const stats = await applyImport(repos, req.user.id, data, mode);
    const parts = [`${stats.days} Tage`, `${stats.blocks} Zeitblöcke`];
    if (mode === 'replace') parts.push(`${stats.schedules} Arbeitszeitmodelle`, `${stats.entitlements} Urlaubsansprüche`, 'Einstellungen');
    req.session.flash = {
      type: 'success',
      text: `Import abgeschlossen (${mode === 'replace' ? 'alle Daten ersetzt' : 'Tage übernommen'}): ${parts.join(', ')}.`,
    };
    res.redirect('/');
  }

  return router;
}

/** Export und Übersichtsseite (nur nach der Einrichtung). */
function exportRoutes({ repos, clock, appVersion }) {
  const router = express.Router();

  router.get('/daten', async (req, res) => {
    const ctx = await loadContext(repos, req.user, clock.today());
    const today = clock.today();
    res.render('data/index', {
      title: 'Daten',
      years: availableYears(ctx),
      current: { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) },
    });
  });

  router.get('/daten/export', async (req, res) => {
    const pad = (m) => String(m).padStart(2, '0');
    const from = req.query.von || (req.query.von_j && `${req.query.von_j}-${pad(req.query.von_m)}`);
    const to = req.query.bis || (req.query.bis_j && `${req.query.bis_j}-${pad(req.query.bis_m)}`);
    const months = monthRange(String(from || ''), String(to || ''));
    if (!months) throw badRequest('Ungültiger Zeitraum: Der Startmonat muss vor dem Endmonat liegen (höchstens 10 Jahre).');
    const ctx = await loadContext(repos, req.user, clock.today());
    if (req.query.format === 'pdf') {
      const { buffer, filename } = await pdfReport(ctx, months);
      return attachment(res, filename, 'application/pdf', buffer);
    }
    if (req.query.format === 'excel') {
      const { buffer, filename } = await excelReport(ctx, months);
      return attachment(res, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from(buffer));
    }
    throw badRequest('Unbekanntes Format.');
  });

  router.get('/daten/sicherung', async (req, res) => {
    const data = await buildExport(repos, req.user, appVersion);
    const json = JSON.stringify(data, null, 2);
    attachment(res, `stundenerfassung_sicherung_${req.user.username}_${clock.today()}.json`, 'application/json; charset=utf-8', json);
  });

  return router;
}

module.exports = { importRoutes, exportRoutes };
