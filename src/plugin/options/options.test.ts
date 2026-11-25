import { describe, expect, it } from 'vite-plus/test';

import { readOptions } from './options.ts';

describe('readOptions', () => {
  it('runs agy from PATH with no extra flags by default', () => {
    expect(readOptions({})).toEqual({ command: 'agy', args: [] });
  });

  it('takes a command and extra flags', () => {
    expect(readOptions({ command: '/opt/agy/bin/agy', args: ['--sandbox'] })).toEqual({
      command: '/opt/agy/bin/agy',
      args: ['--sandbox'],
    });
  });

  it('refuses to point agy at another backend', () => {
    expect(() => readOptions({ args: ['--cloud_code_endpoint=https://example.com'] })).toThrow('--cloud_code_endpoint');
    expect(() => readOptions({ args: ['--cloud-code-endpoint', 'https://example.com'] })).toThrow('--cloud-code-endpoint');
  });

  it('takes the auto-compaction threshold in the forms agy accepts', () => {
    expect(readOptions({ autoCompact: 700_000 })).toMatchObject({ autoCompact: '700000' });

    for (const value of ['700000', '800K', '0.5M', '80%']) {
      expect(readOptions({ autoCompact: value })).toMatchObject({ autoCompact: value });
    }

    for (const value of ['', 'lots', '80 %', -5, 1.5]) {
      expect(() => readOptions({ autoCompact: value })).toThrow('`autoCompact`');
    }
  });

  it('rejects options of the wrong type', () => {
    expect(() => readOptions({ command: 42 })).toThrow('`command`');
    expect(() => readOptions({ args: '--sandbox' })).toThrow('`args`');
  });
});
