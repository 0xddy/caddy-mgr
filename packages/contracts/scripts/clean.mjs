import { rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const distDirectory = resolve(packageRoot, 'dist');

if (dirname(distDirectory) !== packageRoot || basename(distDirectory) !== 'dist') {
  throw new Error(`拒绝清理意外路径：${distDirectory}`);
}

rmSync(distDirectory, { recursive: true, force: true });
