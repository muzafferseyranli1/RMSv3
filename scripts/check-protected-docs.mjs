import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'protected-docs.json');

const args = process.argv.slice(2);
const stagedOnly = args.includes('--staged');
const override = process.env.ALLOW_PROTECTED_DOCS_EDIT === '1';

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const protectedDocs = (config.protectedDocs || []).map((entry) =>
  entry.replaceAll('/', path.sep),
);

if (protectedDocs.length === 0) {
  process.exit(0);
}

const gitArgs = stagedOnly
  ? ['diff', '--cached', '--name-only', '--', ...protectedDocs]
  : ['status', '--porcelain=v1', '--untracked-files=all', '--', ...protectedDocs];

let output = '';

try {
  output = execFileSync('git', gitArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  const stderr = error.stderr?.toString().trim();
  console.error('Protected docs check failed to run git.');
  if (stderr) {
    console.error(stderr);
  }
  process.exit(2);
}

const changedDocs = output
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    if (stagedOnly) {
      return line;
    }
    return line.slice(3).trim();
  });

if (changedDocs.length === 0) {
  console.log(
    `Protected docs check passed (${stagedOnly ? 'staged' : 'working tree'}).`,
  );
  process.exit(0);
}

if (override) {
  console.warn('Protected docs override is active.');
  for (const doc of changedDocs) {
    console.warn(`- ${doc}`);
  }
  process.exit(0);
}

console.error('Protected docs were modified:');
for (const doc of changedDocs) {
  console.error(`- ${doc}`);
}
console.error('');
console.error(
  'Explicit user approval is required before editing these files.',
);
console.error(
  'If approval was given for this session, rerun with ALLOW_PROTECTED_DOCS_EDIT=1.',
);
process.exit(1);
