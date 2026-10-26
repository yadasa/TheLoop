import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const compiler = require.resolve('typescript/bin/tsc');
const result = spawnSync(process.execPath, [compiler, '-p', path.join(root, 'functions/tsconfig.json')], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.signal) throw new Error(`Functions compilation was interrupted by ${result.signal}.`);
process.exitCode = result.status ?? 1;
