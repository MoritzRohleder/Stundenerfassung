'use strict';

const { JsonStorage } = require('./json/adapter');
const { runMigrations } = require('./migrations');

const COLLECTIONS = ['users', 'time_blocks', 'days', 'work_schedules', 'vacation_entitlements'];

/** Wählt den Speicher-Adapter (heute nur JSON) und bereitet ihn vor. */
async function createStorage(config) {
  if (config.storage !== 'json') throw new Error(`Unbekannter Speicher-Adapter: ${config.storage}`);
  const storage = new JsonStorage({ dir: config.dataDir, collections: COLLECTIONS });
  await storage.init();
  await runMigrations(storage);
  return storage;
}

module.exports = { createStorage, COLLECTIONS };
