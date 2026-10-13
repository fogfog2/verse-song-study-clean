import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

const forbidden = /(^|\/)(?:\.private|lyrics|\.git)(?:\/|$)|study\.encrypted\.json$|(?:^|\/)(?:library\.json|password\.txt|\.env(?:\..*)?)$/i;
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const violations = tracked.filter(path => forbidden.test(path));
const catalog = JSON.parse(await readFile('src/catalog.json', 'utf8'));
if (!Array.isArray(catalog) || catalog.some(song => song.captions?.length || song.notes?.length)) {
  violations.push('src/catalog.json: study material in metadata');
}
async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed in distributed assets: ${path}`);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}
const assets = await walk('public');
// Explicit allowlist: new assets must be reviewed before they can be distributed.
violations.push(...assets.filter(path => path !== 'public/favicon.svg'));
if (process.argv.includes('--dist')) {
  const built = await walk('dist');
  violations.push(...built.filter(path => forbidden.test(path)));
  for (const path of built) {
    const content = await readFile(path, 'utf8');
    if (/"ciphertext"\s*:|"english"\s*:\s*"[^"\s]|"korean"\s*:\s*"[^"\s]/.test(content)) violations.push(path);
  }
}
if (violations.length) throw new Error(`Private material must not be tracked or distributed:\n${[...new Set(violations)].join('\n')}`);
console.log('Content boundary check passed (tracked paths, metadata and distribution assets).');
