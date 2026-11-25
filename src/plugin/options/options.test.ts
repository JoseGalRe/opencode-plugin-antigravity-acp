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

  it('rejects options of the wrong type', () => {
    expect(() => readOptions({ command: 42 })).toThrow('`command`');
    expect(() => readOptions({ args: '--sandbox' })).toThrow('`args`');
  });
});
