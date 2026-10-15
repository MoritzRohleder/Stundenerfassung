'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStorage } = require('../src/storage/json/adapter');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'se-store-'));
}

test('JSON-Adapter: anlegen, ändern, löschen, neu laden', async () => {
  const dir = tmpDir();
  const s = new JsonStorage({ dir, collections: ['items'] });
  await s.init();
  const a = await s.insert('items', { name: 'A' });
  assert.ok(a.id);
  await s.update('items', a.id, { name: 'B' });
  await s.insert('items', { name: 'C' });
  await s.close();

  const s2 = new JsonStorage({ dir, collections: ['items'] });
  await s2.init();
  assert.equal((await s2.findById('items', a.id)).name, 'B');
  assert.equal((await s2.findAll('items')).length, 2);
  await s2.remove('items', a.id);
  assert.equal((await s2.findAll('items', { name: 'C' })).length, 1);
  await s2.close();
  assert.ok(fs.readdirSync(path.join(dir, 'backup')).length > 0, 'Sicherungskopien angelegt');
});

test('JSON-Adapter: Rückgabewerte sind Kopien', async () => {
  const s = new JsonStorage({ dir: tmpDir(), collections: ['items'] });
  await s.init();
  const a = await s.insert('items', { list: [1] });
  a.list.push(2);
  assert.deepEqual((await s.findById('items', a.id)).list, [1]);
});

test('JSON-Adapter: Transaktion ganz oder gar nicht', async () => {
  const dir = tmpDir();
  const s = new JsonStorage({ dir, collections: ['items'] });
  await s.init();
  await s.insert('items', { name: 'bleibt' });
  await assert.rejects(
    s.transaction(async () => {
      await s.insert('items', { name: 'weg' });
      await s.removeWhere('items', { name: 'bleibt' });
      throw new Error('Abbruch');
    }),
  );
  assert.deepEqual((await s.findAll('items')).map((i) => i.name), ['bleibt']);
  await s.transaction(async () => {
    await s.insert('items', { name: 'x' });
    await s.insert('items', { name: 'y' });
  });
  await s.close();
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'items.json'), 'utf8'));
  assert.equal(onDisk.length, 3);
});
