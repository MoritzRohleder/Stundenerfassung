'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const session = require('express-session');

// Kleiner Datei-Store für express-session: Sitzungen überstehen einen Neustart.
class FileSessionStore extends session.Store {
  constructor({ file, ttlMs }) {
    super();
    this.file = file;
    this.ttlMs = ttlMs;
    this.sessions = {};
    this.timer = null;
    this.writing = Promise.resolve();
    if (fs.existsSync(file)) {
      try {
        this.sessions = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        this.sessions = {};
      }
    }
    this.prune();
  }

  expiresAt(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires;
    return exp ? new Date(exp).getTime() : Date.now() + this.ttlMs;
  }

  prune() {
    const now = Date.now();
    for (const [sid, entry] of Object.entries(this.sessions)) {
      if (entry.expires < now) delete this.sessions[sid];
    }
  }

  get(sid, cb) {
    const entry = this.sessions[sid];
    if (!entry) return cb(null, null);
    if (entry.expires < Date.now()) {
      delete this.sessions[sid];
      this.schedule();
      return cb(null, null);
    }
    return cb(null, structuredClone(entry.sess));
  }

  set(sid, sess, cb) {
    this.sessions[sid] = { sess: structuredClone(sess), expires: this.expiresAt(sess) };
    this.schedule();
    cb && cb(null);
  }

  touch(sid, sess, cb) {
    if (this.sessions[sid]) {
      this.sessions[sid].expires = this.expiresAt(sess);
      this.schedule();
    }
    cb && cb(null);
  }

  destroy(sid, cb) {
    delete this.sessions[sid];
    this.schedule();
    cb && cb(null);
  }

  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.save();
    }, 1000);
    this.timer.unref();
  }

  save() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.prune();
    const json = JSON.stringify(this.sessions);
    this.writing = this.writing.then(async () => {
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fsp.writeFile(tmp, json, { mode: 0o600 });
      await fsp.rename(tmp, this.file);
    }).catch((err) => console.error('Sitzungen konnten nicht gespeichert werden:', err));
    return this.writing;
  }
}

module.exports = { FileSessionStore };
