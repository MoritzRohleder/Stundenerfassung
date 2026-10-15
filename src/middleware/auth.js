'use strict';

/** Lädt den angemeldeten Nutzer in req.user / res.locals.user. */
function loadUser(repos) {
  return async (req, res, next) => {
    res.locals.user = null;
    if (req.session.userId) {
      const user = await repos.users.findById(req.session.userId);
      if (user) {
        req.user = user;
        res.locals.user = user;
      } else {
        delete req.session.userId;
      }
    }
    next();
  };
}

function requireLogin(req, res, next) {
  if (req.user) {
    res.set('Cache-Control', 'no-store');
    return next();
  }
  return res.redirect('/login');
}

/** Solange die Einrichtung fehlt, führen alle Seiten dorthin (Spec 8.1). */
function requireSetup(req, res, next) {
  if (req.user && !req.user.setup_done) return res.redirect('/einrichtung');
  return next();
}

module.exports = { loadUser, requireLogin, requireSetup };
