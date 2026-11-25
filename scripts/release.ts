import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assetName, changelogSection, repositoryOf } from './release-lib.ts';

type Release = {
  readonly id: number;
  readonly html_url: string;
  readonly assets: readonly { readonly id: number; readonly name: string }[];
};

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const DEFAULT_GITEA_URL = 'http://127.0.0.1:7531';

const dryRun = process.argv.includes('--dry-run');

function fail(message: string): never {
  console.error(`release: ${message}`);
  process.exit(1);
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function isRelease(value: unknown): value is Release {
  return value !== null && typeof value === 'object' && 'id' in value && 'html_url' in value && 'assets' in value;
}

const manifest: unknown = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

const { name: packageName, version } =
  manifest !== null && typeof manifest === 'object' && 'name' in manifest && 'version' in manifest
    ? { name: String(manifest.name), version: String(manifest.version) }
    : fail('package.json has no name or version.');

const tag = `v${version}`;
const asset = assetName(packageName, version);

const notes =
  changelogSection(await readFile(join(ROOT, 'CHANGELOG.md'), 'utf8').catch(() => ''), version) ??
  fail(`CHANGELOG.md has no section for ${version}; write it, commit it, then release.`);

if (git('status', '--porcelain', '--untracked-files=no') !== '') {
  fail('tracked files have uncommitted changes; commit them first.');
}

const branch = git('branch', '--show-current') || fail('HEAD is detached; check out a branch.');
const repository = repositoryOf(git('remote', 'get-url', 'origin')) ?? fail('the origin remote names no owner/repository.');
const head = git('rev-parse', 'HEAD');
const tagged = git('tag', '--list', tag) === tag ? git('rev-list', '-n', '1', tag) : null;

if (tagged !== null && tagged !== head) {
  fail(`${tag} already points at ${tagged.slice(0, 7)}, not HEAD; bump the version.`);
}

const base = (process.env['GITEA_URL'] || DEFAULT_GITEA_URL).replace(/\/+$/, '');
const token = process.env['GITEA_TOKEN'] || (dryRun ? '' : fail('GITEA_TOKEN is not set.'));
const api = `${base}/api/v1/repos/${repository.owner}/${repository.name}`;

async function call(path: string, init: RequestInit = {}, missingIsAnswer = false): Promise<Response> {
  const headers = new Headers(init.headers);

  headers.set('Authorization', `token ${token}`);
  headers.set('Accept', 'application/json');

  const response = await fetch(`${api}${path}`, { ...init, headers });

  if (!response.ok && !(missingIsAnswer && response.status === 404)) {
    fail(`${init.method ?? 'GET'} ${path} answered ${response.status}: ${await response.text()}`);
  }

  return response;
}

async function readRelease(response: Response): Promise<Release> {
  const body: unknown = await response.json();

  return isRelease(body) ? body : fail(`Gitea answered something that is not a release: ${JSON.stringify(body)}`);
}

function json(body: unknown): RequestInit {
  return { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
}

console.log(`release: ${repository.owner}/${repository.name} ${tag} from ${branch} (${head.slice(0, 7)})`);

if (dryRun) {
  console.log(`release: would push ${branch} and ${tag}, build, and publish ${asset} on ${base}:\n\n${notes}`);
  process.exit(0);
}

git('push', 'origin', branch);

if (tagged === null) {
  git('tag', '-a', tag, '-m', `${tag}\n\n${notes}`);
}

git('push', 'origin', tag);

execFileSync('pnpm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

const plugin = await readFile(join(ROOT, 'dist', 'index.js'));
const found = await call(`/releases/tags/${tag}`, {}, true);

const release = await readRelease(
  found.status === 404
    ? await call('/releases', {
        method: 'POST',
        ...json({ tag_name: tag, name: tag, body: notes, draft: false, prerelease: false }),
      })
    : await call(`/releases/${(await readRelease(found)).id}`, { method: 'PATCH', ...json({ name: tag, body: notes }) }),
);

for (const existing of release.assets.filter((candidate) => candidate.name === asset)) {
  await call(`/releases/${release.id}/assets/${existing.id}`, { method: 'DELETE' });
}

const form = new FormData();

form.append('attachment', new Blob([plugin], { type: 'text/javascript' }), asset);
await call(`/releases/${release.id}/assets?name=${encodeURIComponent(asset)}`, { method: 'POST', body: form });

console.log(`release: ${release.html_url} with ${asset}`);
