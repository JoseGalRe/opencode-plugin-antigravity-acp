import { readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { createAttachments } from './attachments.ts';

describe('createAttachments', () => {
  it('writes each file privately under a unique name that keeps the original one', async () => {
    const attachments = createAttachments();
    const data = new Uint8Array([37, 80, 68, 70]);

    const first = await attachments.write({ data, mediaType: 'application/pdf', filename: '../My report.pdf' });
    const second = await attachments.write({ data, mediaType: 'application/pdf', filename: undefined });

    expect(first).toMatch(/-My_report\.pdf$/);
    expect(second).toMatch(/-attachment$/);
    expect(dirname(first)).toBe(dirname(second));

    expect(await readFile(first)).toEqual(Buffer.from(data));
    expect((await stat(first)).mode & 0o777).toBe(0o600);
    expect((await stat(dirname(first))).mode & 0o777).toBe(0o700);

    await attachments.dispose();
  });

  it('removes the directory on dispose, and disposing twice or unused is safe', async () => {
    const attachments = createAttachments();
    const path = await attachments.write({ data: new Uint8Array([1]), mediaType: 'application/zip', filename: 'a.zip' });

    await attachments.dispose();
    await attachments.dispose();
    await createAttachments().dispose();

    await expect(stat(dirname(path))).rejects.toThrow('ENOENT');
  });
});
