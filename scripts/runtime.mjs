import { readFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const RUNTIME_FILES = Object.freeze([
  'index.html', 'styles.css', 'icon.svg', 'manifest.webmanifest',
  'app.mjs', 'model.mjs', 'audio.mjs', 'session.mjs', 'screen.mjs',
]);

export async function readRuntime() {
  const files = new Map();
  for (const name of RUNTIME_FILES) {
    const source = path.join(ROOT, name);
    const info = await lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular runtime file: ${name}`);
    files.set(name, await readFile(source));
  }
  return files;
}
