// A stand-in for `agy acp`: an ACP server on stdio that echoes each prompt back.
// It reports the arguments it was started with, so tests can check them.
import { Readable, Writable } from 'node:stream';

import { agent, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

const input = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
const output = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;

process.stderr.write(`fake-agy started with: ${process.argv.slice(2).join(' ')}\n`);

agent()
  .onRequest('initialize', () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentInfo: { name: 'Fake ACP Server', version: '0.0.0' },
    _meta: { args: process.argv.slice(2), cwd: process.cwd() },
  }))
  .onRequest('session/new', () => ({ sessionId: 'fake-session' }))
  .onRequest('session/prompt', async ({ params, client }) => {
    for (const block of params.prompt) {
      if (block.type === 'text') {
        await client.notify('session/update', {
          sessionId: params.sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `echo: ${block.text}` } },
        });
      }
    }

    return { stopReason: 'end_turn' };
  })
  .connect(ndJsonStream(output, input));
