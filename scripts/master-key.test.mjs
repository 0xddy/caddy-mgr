import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMigrationMasterKey } from './master-key.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'caddy-mgr-master-key-'));
  const databasePath = join(root, 'data', 'database.sqlite');
  const masterKeyPath = join(root, 'secrets', 'master.key');
  return {
    databasePath,
    masterKeyPath,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('creates exactly one 32-byte key before a fresh migration', (context) => {
  const current = fixture();
  context.after(current.dispose);

  assert.deepEqual(ensureMigrationMasterKey(current), { created: true });
  assert.equal(readFileSync(current.masterKeyPath).length, 32);
  if (process.platform !== 'win32') {
    assert.equal(statSync(current.masterKeyPath).mode & 0o777, 0o600);
  }

  assert.deepEqual(ensureMigrationMasterKey(current), { created: false });
});

test('refuses to invent a key for an existing database', (context) => {
  const current = fixture();
  context.after(current.dispose);
  mkdirSync(join(current.databasePath, '..'), { recursive: true });
  writeFileSync(current.databasePath, 'existing database');

  assert.throws(
    () => ensureMigrationMasterKey(current),
    /Database already exists.*master key is missing/u,
  );
});

test('refuses a master key with the wrong byte length', (context) => {
  const current = fixture();
  context.after(current.dispose);
  mkdirSync(join(current.masterKeyPath, '..'), { recursive: true });
  writeFileSync(current.masterKeyPath, Buffer.alloc(31));

  assert.throws(() => ensureMigrationMasterKey(current), /exactly 32 bytes; found 31/u);
});
