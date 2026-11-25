import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import type { Attachments } from './attachments.types.ts';

/**
 * The prefix of the directory under the system's temporary directory.
 */
const DIRECTORY_PREFIX = 'opencode-antigravity-';

/**
 * The characters kept from an attachment's own name; the rest become `_`.
 */
const UNSAFE_NAME = /[^\w.-]+/g;

/**
 * Creates the private directory for attached files. Nothing is written until the first file.
 *
 * @returns The attachments directory.
 */
export function createAttachments(): Attachments {
  let directory: Promise<string> | undefined;

  return {
    write: async ({ data, filename }) => {
      // `mkdtemp` creates the directory readable by this user only.
      directory ??= mkdtemp(join(tmpdir(), DIRECTORY_PREFIX));

      const name = basename(filename ?? 'attachment').replace(UNSAFE_NAME, '_');
      const path = join(await directory, `${randomUUID()}-${name}`);

      await writeFile(path, data, { mode: 0o600 });

      return path;
    },
    dispose: async () => {
      const current = directory;

      directory = undefined;

      if (current) {
        await rm(await current, { recursive: true, force: true });
      }
    },
  };
}
