import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, RUNTIME_FILES, readRuntime } from './runtime.mjs';

try {
  const runtime = await readRuntime();
  const modules = [
    ...RUNTIME_FILES.filter(file => file.endsWith('.mjs')),
    'scripts/runtime.mjs', 'scripts/check.mjs', 'scripts/build.mjs', 'scripts/serve.mjs',
  ];
  for (const file of modules) {
    const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Syntax check failed: ${file}`);
  }
  const manifest = JSON.parse(runtime.get('manifest.webmanifest').toString('utf8'));
  if (manifest.start_url !== './' || manifest.scope !== './') {
    throw new Error('The manifest must work from a GitHub Pages repository subpath.');
  }
  const html = runtime.get('index.html').toString('utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML IDs make controls ambiguous.');
  const resources = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map(match => match[1]);
  for (const resource of resources) {
    if (!RUNTIME_FILES.includes(resource)) throw new Error(`HTML resource omitted from deployment: ${resource}`);
  }
  for (const [name, bytes] of runtime) {
    if (!name.endsWith('.mjs')) continue;
    const source = bytes.toString('utf8');
    for (const imported of source.matchAll(/(?:from\s*|import\s*\()\s*['"]\.\/([^'"]+)['"]/g)) {
      if (!RUNTIME_FILES.includes(imported[1])) throw new Error(`Module omitted from deployment: ${imported[1]}`);
    }
  }
  console.log(`Checked ${modules.length} module syntaxes, runtime references, unique IDs and repository-relative manifest.`);
} catch (error) {
  console.error(`Check failed: ${error.message}`);
  process.exitCode = 1;
}
