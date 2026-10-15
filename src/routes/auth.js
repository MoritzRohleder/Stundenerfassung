'use strict';

const express = require('express');
const { hashPassword, verifyPassword, verifyDummy, validateCredentials } = require('../services/auth');

function regenerate(req) {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

function authRoutes({ repos, limiter }) {
  const router = express.Router();

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('auth/login', { title: 'Anmelden', errors: [], username: '' });
  });

  router.post('/login', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const ip = req.ip;

    const wait = limiter.waitSeconds(ip, username);
    if (wait > 0) {
      res.status(429).set('Retry-After', String(wait));
      return res.render('auth/login', {
        title: 'Anmelden',
        errors: [`Zu viele Fehlversuche. Bitte warte ${wait} Sekunden.`],
        username,
      });
    }

    const user = username ? await repos.users.findByUsername(username) : null;
    const ok = user ? await verifyPassword(password, user.password_hash) : await verifyDummy(password);
    if (!ok) {
      limiter.fail(ip, username);
      return res.status(401).render('auth/login', {
        title: 'Anmelden',
        errors: ['Nutzername oder Passwort falsch.'],
        username,
      });
    }
    limiter.success(ip, username);
    await regenerate(req);
    req.session.userId = user.id;
    res.redirect('/');
  });

  router.get('/registrieren', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('auth/register', { title: 'Registrieren', errors: [], username: '' });
  });

  router.post('/registrieren', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const { password, password_repeat: passwordRepeat } = req.body;
    const errors = validateCredentials(username, password, passwordRepeat);
    if (errors.length === 0 && (await repos.users.findByUsername(username))) {
      errors.push('Dieser Nutzername ist schon vergeben.');
    }
    if (errors.length) {
      return res.status(400).render('auth/register', { title: 'Registrieren', errors, username });
    }
    const user = await repos.users.create({
      username,
      password_hash: await hashPassword(password),
      theme: 'auto',
      state: null,
      tracking_start: null,
      overtime_start_minutes: null,
      vacation_days_default: null,
      setup_done: false,
    });
    await regenerate(req);
    req.session.userId = user.id;
    res.redirect('/einrichtung');
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('se.sid');
      res.redirect('/login');
    });
  });

  return router;
}

module.exports = { authRoutes };
