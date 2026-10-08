import { mkdir, lstat, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, readRuntime } from './runtime.mjs';

try {
  // Read every source before touching the previous build.
  const files = await readRuntime();
  const root = await realpath(ROOT);
  const destination = path.resolve(root, 'dist');
  if (path.dirname(destination) !== root || path.basename(destination) !== 'dist') {
    throw new Error('Refusing to clean a directory outside this project.');
  }
  const current = await lstat(destination).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (current) {
    if (!current.isDirectory() || current.isSymbolicLink() || await realpath(destination) !== destination) {
      throw new Error('Refusing to replace a linked or non-directory dist path.');
    }
    await rm(destination, { recursive: true, force: false });
  }
  await mkdir(destination);
  for (const [name, bytes] of files) await writeFile(path.join(destination, name), bytes);
  console.log(`Built ${files.size} runtime files in dist/. No documentation, tests or private files are deployed.`);
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
