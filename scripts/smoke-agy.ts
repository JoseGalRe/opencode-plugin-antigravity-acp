// Talks to the real `agy acp` without prompting, so it spends no quota:
// `initialize`, and with `--session` a `session/new` and `session/close` too,
// which show the models and options `agy` offers this client.
//
//   node scripts/smoke-agy.ts [--session] [--agy <path>]
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';

import { connectAgyClient } from '../src/acp/client.ts';
import { DEFAULT_AGY_ARGS, spawnAgy } from '../src/agy/process.ts';

const { values } = parseArgs({
  options: {
    session: { type: 'boolean', default: false },
    agy: { type: 'string', default: 'agy' },
  },
});

const cwd = realpathSync(tmpdir());
const agy = spawnAgy({ command: values.agy, args: [...DEFAULT_AGY_ARGS], cwd });

const updates: string[] = [];

try {
  const acp = await connectAgyClient(agy.stream, {
    onSessionUpdate: ({ update }) => updates.push(update.sessionUpdate),
    requestPermission: () => Promise.resolve({ outcome: { outcome: 'cancelled' } }),
  });

  const { agentInfo, protocolVersion, authMethods } = acp.agent;

  console.log(JSON.stringify({ agentInfo, protocolVersion, authMethods: authMethods?.map((method) => method.id) }, null, 2));

  if (values.session) {
    const session = await acp.newSession({ cwd, mcpServers: [] });

    console.log(
      JSON.stringify(
        {
          sessionId: session.sessionId,
          modes: session.modes?.availableModes.map((mode) => mode.id),
          configOptions: session.configOptions?.map((option) => ({
            id: option.id,
            name: option.name,
            current: option.currentValue,
            values: option.type === 'select' ? option.options : undefined,
          })),
        },
        null,
        2,
      ),
    );

    await acp.closeSession({ sessionId: session.sessionId });

    console.log('updates seen:', [...new Set(updates)].join(', ') || 'none');
  }

  acp.close();
} finally {
  agy.kill();
}
