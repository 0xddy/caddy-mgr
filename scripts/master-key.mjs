import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MASTER_KEY_BYTES = 32;

function readAndValidateMasterKey(masterKeyPath) {
  const key = readFileSync(masterKeyPath);
  if (key.length !== MASTER_KEY_BYTES) {
    throw new Error(
      `Master key at ${masterKeyPath} must contain exactly ${MASTER_KEY_BYTES} bytes; found ${key.length}`,
    );
  }
  return key;
}

/**
 * Ensure migrations cannot create a database before its encryption key exists.
 * Existing databases never cause a replacement key to be generated.
 */
export function ensureMigrationMasterKey({ databasePath, masterKeyPath }) {
  if (existsSync(masterKeyPath)) {
    readAndValidateMasterKey(masterKeyPath);
    try {
      chmodSync(masterKeyPath, 0o600);
    } catch {
      // Windows ACLs do not implement POSIX modes; operators still control file placement.
    }
    return { created: false };
  }

  if (existsSync(databasePath)) {
    throw new Error(
      `Database already exists at ${databasePath}, but its master key is missing at ${masterKeyPath}; restore the original key from backup`,
    );
  }

  mkdirSync(dirname(masterKeyPath), { recursive: true, mode: 0o700 });
  let created = true;
  try {
    writeFileSync(masterKeyPath, randomBytes(MASTER_KEY_BYTES), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    // A concurrent first-run wrapper may have won the atomic create race.
    if (error?.code !== 'EEXIST') throw error;
    created = false;
  }

  readAndValidateMasterKey(masterKeyPath);
  try {
    chmodSync(masterKeyPath, 0o600);
  } catch {
    // See the Windows note above.
  }
  return { created };
}
