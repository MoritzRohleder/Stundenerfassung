'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// JSON-Adapter der Speicherschicht (Spec 10.3):
// - alle Daten im Arbeitsspeicher, eine Datei pro Sammlung
// - Schreiben nacheinander über eine Warteschlange, atomar (temp + rename)
// - Sicherungskopie der letzten Stände in backup/

const BACKUPS_PER_COLLECTION = 10;

function clone(value) {
  return structuredClone(value);
}

function matches(record, filter) {
  if (!filter) return true;
  if (typeof filter === 'function') return filter(record);
  return Object.entries(filter).every(([k, v]) => record[k] === v);
}

class JsonStorage {
  constructor({ dir, collections }) {
    this.dir = dir;
    this.backupDir = path.join(dir, 'backup');
    this.collections = collections;
    this.data = {};
    this.dirty = new Set();
    this.txDepth = 0;
    this.queue = Promise.resolve();
    this.lastError = null;
  }

  async init() {
    await fsp.mkdir(this.backupDir, { recursive: true });
    for (const name of [...this.collections, 'meta']) {
      const file = this.file(name);
      if (fs.existsSync(file)) {
        this.data[name] = JSON.parse(await fsp.readFile(file, 'utf8'));
      } else {
        this.data[name] = name === 'meta' ? { schema_version: 1, migrations_done: [] } : [];
        this.dirty.add(name);
      }
    }
    await this.flush();
  }

  file(name) {
    return path.join(this.dir, `${name}.json`);
  }

  list(collection) {
    const list = this.data[collection];
    if (!Array.isArray(list)) throw new Error(`Unbekannte Sammlung: ${collection}`);
    return list;
  }

  async findAll(collection, filter) {
    return this.list(collection).filter((r) => matches(r, filter)).map(clone);
  }

  async findOne(collection, filter) {
    const found = this.list(collection).find((r) => matches(r, filter));
    return found ? clone(found) : null;
  }

  async findById(collection, id) {
    return this.findOne(collection, (r) => r.id === id);
  }

  async insert(collection, record) {
    const now = new Date().toISOString();
    const full = { id: crypto.randomUUID(), ...clone(record), created_at: now, updated_at: now };
    this.list(collection).push(full);
    await this.changed(collection);
    return clone(full);
  }

  async update(collection, id, changes) {
    const list = this.list(collection);
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const { id: _ignored, created_at: _c, ...rest } = changes;
    list[idx] = { ...list[idx], ...clone(rest), updated_at: new Date().toISOString() };
    await this.changed(collection);
    return clone(list[idx]);
  }

  async remove(collection, id) {
    const list = this.list(collection);
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await this.changed(collection);
    return true;
  }

  async removeWhere(collection, filter) {
    const list = this.list(collection);
    const keep = list.filter((r) => !matches(r, filter));
    const removed = list.length - keep.length;
    if (removed) {
      this.data[collection] = keep;
      await this.changed(collection);
    }
    return removed;
  }

  async getMeta() {
    return clone(this.data.meta);
  }

  async setMeta(changes) {
    this.data.meta = { ...this.data.meta, ...clone(changes) };
    await this.changed('meta');
  }

  /**
   * Mehrere Änderungen gemeinsam oder gar nicht ausführen.
   * Bei einem Fehler wird der Stand von vorher wiederhergestellt.
   */
  async transaction(fn) {
    const snapshot = this.txDepth === 0 ? clone(this.data) : null;
    const dirtyBefore = this.txDepth === 0 ? new Set(this.dirty) : null;
    this.txDepth += 1;
    try {
      const result = await fn(this);
      this.txDepth -= 1;
      if (this.txDepth === 0) await this.flush();
      return result;
    } catch (err) {
      this.txDepth -= 1;
      if (snapshot) {
        this.data = snapshot;
        this.dirty = dirtyBefore;
      }
      throw err;
    }
  }

  async changed(collection) {
    this.dirty.add(collection);
    if (this.txDepth === 0) await this.flush();
  }

  /** Schreibt alle geänderten Sammlungen (über die Warteschlange). */
  flush() {
    const names = [...this.dirty];
    this.dirty.clear();
    if (names.length === 0) return this.queue;
    const snapshot = names.map((name) => [name, JSON.stringify(this.data[name], null, 2)]);
    const job = this.queue.then(async () => {
      for (const [name, json] of snapshot) await this.writeFile(name, json);
    });
    // Ein Fehler soll nicht alle folgenden Schreibzugriffe blockieren.
    this.queue = job.catch((err) => {
      this.lastError = err;
    });
    return job;
  }

  async writeFile(name, json) {
    const file = this.file(name);
    if (fs.existsSync(file)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fsp.copyFile(file, path.join(this.backupDir, `${name}.${stamp}.json`));
      await this.pruneBackups(name);
    }
    const tmp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, json, 'utf8');
    await fsp.rename(tmp, file);
  }

  async pruneBackups(name) {
    const files = (await fsp.readdir(this.backupDir))
      .filter((f) => f.startsWith(`${name}.`) && f.endsWith('.json'))
      .sort();
    const excess = files.length - BACKUPS_PER_COLLECTION;
    for (let i = 0; i < excess; i++) await fsp.rm(path.join(this.backupDir, files[i]), { force: true });
  }

  /** Wartet, bis alle Schreibzugriffe erledigt sind (z. B. beim Herunterfahren). */
  async close() {
    await this.flush();
    await this.queue;
  }
}

module.exports = { JsonStorage };
