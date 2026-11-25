import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assetName, changelogSection } from './release-lib.ts';

/**
 * Prepares a GitHub release the way `pnpm release` prepares a Gitea one: writes the CHANGELOG.md section of
 * package.json's version to the file named by the first argument, and prints the name the plugin file is attached
 * under. `.github/workflows/publish.yml` runs it: `node scripts/release-notes.ts notes.md`.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function fail(message: string): never {
  console.error(`release-notes: ${message}`);
  process.exit(1);
}

const output = process.argv[2] ?? fail('name the file to write the notes to.');
const manifest: unknown = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

const { name, version } =
  manifest !== null && typeof manifest === 'object' && 'name' in manifest && 'version' in manifest
    ? { name: String(manifest.name), version: String(manifest.version) }
    : fail('package.json has no name or version.');

const notes =
  changelogSection(await readFile(join(ROOT, 'CHANGELOG.md'), 'utf8'), version) ??
  fail(`CHANGELOG.md has no section for ${version}.`);

await writeFile(output, `${notes}\n`);
console.log(assetName(name, version));
