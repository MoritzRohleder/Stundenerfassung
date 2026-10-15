'use strict';

// Einmalige Anpassungen bestehender Daten an neue Felder.
// Erledigte Migrationen stehen in meta.json (migrations_done).
const MIGRATIONS = [];

async function runMigrations(storage) {
  const meta = await storage.getMeta();
  const done = new Set(meta.migrations_done || []);
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    await storage.transaction(async () => {
      await migration.run(storage);
      done.add(migration.id);
      await storage.setMeta({ migrations_done: [...done] });
    });
  }
}

module.exports = { runMigrations, MIGRATIONS };
