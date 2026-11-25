import type { Repository } from './release-lib.types.ts';

/**
 * The CHANGELOG.md section of a version: everything under its `## <version>` heading up to the next `## ` heading,
 * trimmed.
 *
 * @param changelog The whole CHANGELOG.md.
 * @param version The version, as in package.json (`0.1.0`).
 *
 * @returns The section, or `null` when there is none or it is empty.
 */
export function changelogSection(changelog: string, version: string): string | null {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);

  if (start === -1) {
    return null;
  }

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const section = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();

  return section.length > 0 ? section : null;
}

/**
 * The repository a Git remote points at, for SSH (`host:owner/name.git`, `ssh://git@host:port/owner/name.git`) and
 * HTTP remotes alike.
 *
 * @param remote The remote's URL, as `git remote get-url` prints it.
 *
 * @returns The owner and name, or `null` for anything else.
 */
export function repositoryOf(remote: string): Repository | null {
  const match = /[:/]([^/:\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim());
  const [, owner, name] = match ?? [];

  return owner && name ? { owner, name } : null;
}

/**
 * The file name the plugin is published under in a release: the package name and the version, so a downloaded copy
 * says what it is.
 *
 * @param packageName The `name` in package.json.
 * @param version The `version` in package.json.
 *
 * @returns The asset name (`opencode-plugin-antigravity-acp-0.1.0.js`).
 */
export function assetName(packageName: string, version: string): string {
  return `${packageName}-${version}.js`;
}
