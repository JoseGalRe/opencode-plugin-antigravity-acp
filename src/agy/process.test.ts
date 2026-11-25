import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';

import { connectAgyClient } from '../acp/client.ts';

import { DEFAULT_AGY_ARGS, spawnAgy } from './process.ts';

const FAKE_AGY = fileURLToPath(new URL('../../tests/fixtures/fake-agy.ts', import.meta.url));

describe('spawnAgy', () => {
  it('runs an ACP server over the subprocess’s stdio, in the given directory', async () => {
    let stderr = '';

    const cwd = realpathSync(tmpdir());

    const agy = spawnAgy({
      command: process.execPath,
      args: [FAKE_AGY, ...DEFAULT_AGY_ARGS],
      cwd,
      onStderr: (text) => {
        stderr += text;
      },
    });

    const chunks: string[] = [];

    const acp = await connectAgyClient(agy.stream, {
      onSessionUpdate: ({ update }) => {
        if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
          chunks.push(update.content.text);
        }
      },
      requestPermission: () => Promise.resolve({ outcome: { outcome: 'cancelled' } }),
    });

    expect(acp.agent._meta).toEqual({ args: ['acp', '--disable-telemetry'], cwd });

    const { sessionId } = await acp.newSession({ cwd, mcpServers: [] });

    const response = await acp.prompt({ sessionId, prompt: [{ type: 'text', text: 'ping' }] });

    expect(response.stopReason).toBe('end_turn');
    expect(chunks).toEqual(['echo: ping']);

    acp.close();
    agy.kill();

    await expect(agy.exited).resolves.toMatchObject({ signal: 'SIGTERM' });
    expect(stderr).toContain('fake-agy started with: acp --disable-telemetry');
  });

  it('rejects `exited` when the command cannot start', async () => {
    const agy = spawnAgy({ command: '/nonexistent/agy', args: [...DEFAULT_AGY_ARGS], cwd: tmpdir() });

    await expect(agy.exited).rejects.toThrow(/ENOENT/);
  });
});
