import { agent, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vite-plus/test';

import { connectAgyClient } from './client.ts';
import { CLIENT_INFO } from './client.types.ts';

import type { AgyClientHandlers } from './client.types.ts';
import type { InitializeRequest, RequestPermissionResponse, SessionNotification, Stream } from '@agentclientprotocol/sdk';

/**
 * Two ndjson streams joined back to back, as `agy acp`'s stdio would be.
 */
function streamPair(): { clientSide: Stream; agentSide: Stream } {
  const toAgent = new TransformStream<Uint8Array, Uint8Array>();
  const toClient = new TransformStream<Uint8Array, Uint8Array>();

  return {
    clientSide: ndJsonStream(toAgent.writable, toClient.readable),
    agentSide: ndJsonStream(toClient.writable, toAgent.readable),
  };
}

function voidFn(): void {
  // no-op
}

function deferred<T>() {
  let resolve: (value: T) => void = voidFn;

  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

const PERMISSION_OPTIONS = [
  { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
  { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
] as const;

function handlers(overrides: Partial<AgyClientHandlers> = {}): AgyClientHandlers {
  return {
    onSessionUpdate: () => {},
    requestPermission: () => Promise.resolve({ outcome: { outcome: 'selected', optionId: 'deny' } }),
    ...overrides,
  };
}

function textChunk(sessionId: string, text: string): SessionNotification {
  return { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } };
}

describe('connectAgyClient', () => {
  it('introduces itself honestly and advertises only the capabilities it serves', async () => {
    const { clientSide, agentSide } = streamPair();

    const received: InitializeRequest[] = [];

    agent()
      .onRequest('initialize', ({ params }) => {
        received.push(params);
        return { protocolVersion: PROTOCOL_VERSION, agentInfo: { name: 'Fake ACP Server', version: '1.0.0' }, authMethods: [] };
      })
      .connect(agentSide);

    const acp = await connectAgyClient(clientSide, handlers());

    // The SDK's schema fills in defaults such as `auth`; only what the client sent is checked.
    expect(received).toHaveLength(1);

    expect(received[0]).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: CLIENT_INFO,
    });

    expect(CLIENT_INFO.name).toBe('opencode-plugin-antigravity-acp');
    expect(acp.agent.agentInfo?.name).toBe('Fake ACP Server');

    acp.close();
  });

  it('advertises file access and routes it to the file-system handlers', async () => {
    const { clientSide, agentSide } = streamPair();

    const written: string[] = [];

    let capabilities: InitializeRequest['clientCapabilities'];

    agent()
      .onRequest('initialize', ({ params }) => {
        capabilities = params.clientCapabilities;
        return { protocolVersion: PROTOCOL_VERSION };
      })
      .onRequest('session/new', () => ({ sessionId: 's1' }))
      .onRequest('session/prompt', async ({ params, client }) => {
        const { content } = await client.request('fs/read_text_file', { sessionId: params.sessionId, path: '/repo/a.txt' });

        await client.request('fs/write_text_file', {
          sessionId: params.sessionId,
          path: '/repo/b.txt',
          content: `${content}!`,
        });

        return { stopReason: 'end_turn' };
      })
      .connect(agentSide);

    const acp = await connectAgyClient(
      clientSide,
      handlers({
        fileSystem: {
          readTextFile: (request) => Promise.resolve({ content: `contents of ${request.path}` }),
          writeTextFile: (request) => {
            written.push(`${request.path}=${request.content}`);
            return Promise.resolve();
          },
        },
      }),
    );

    const { sessionId } = await acp.newSession({ cwd: '/repo', mcpServers: [] });

    await expect(acp.prompt({ sessionId, prompt: [{ type: 'text', text: 'copy' }] })).resolves.toEqual({
      stopReason: 'end_turn',
    });

    expect(capabilities?.fs).toEqual({ readTextFile: true, writeTextFile: true });
    expect(written).toEqual(['/repo/b.txt=contents of /repo/a.txt!']);

    acp.close();
  });

  it('delivers a turn’s updates in order before the turn settles', async () => {
    const { clientSide, agentSide } = streamPair();

    const seen: string[] = [];

    agent()
      .onRequest('initialize', () => ({ protocolVersion: PROTOCOL_VERSION }))
      .onRequest('session/new', () => ({ sessionId: 's1' }))
      .onRequest('session/prompt', async ({ params, client }) => {
        for (const text of ['Hel', 'lo', ' world']) {
          await client.notify('session/update', textChunk(params.sessionId, text));
        }

        return { stopReason: 'end_turn' };
      })
      .connect(agentSide);

    const acp = await connectAgyClient(
      clientSide,
      handlers({
        onSessionUpdate: ({ update }) => {
          if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
            seen.push(update.content.text);
          }
        },
      }),
    );

    const { sessionId } = await acp.newSession({ cwd: '/repo', mcpServers: [] });
    const response = await acp.prompt({ sessionId, prompt: [{ type: 'text', text: 'hi' }] });

    expect(seen).toEqual(['Hel', 'lo', ' world']);
    expect(response.stopReason).toBe('end_turn');

    acp.close();
  });

  it('passes the decision on a permission request back to the agent', async () => {
    const { clientSide, agentSide } = streamPair();

    const outcomes: RequestPermissionResponse[] = [];

    agent()
      .onRequest('initialize', () => ({ protocolVersion: PROTOCOL_VERSION }))
      .onRequest('session/new', () => ({ sessionId: 's1' }))
      .onRequest('session/prompt', async ({ params, client }) => {
        outcomes.push(
          await client.request('session/request_permission', {
            sessionId: params.sessionId,
            toolCall: { toolCallId: 't1', title: 'rm -rf build' },
            options: [...PERMISSION_OPTIONS],
          }),
        );
        return { stopReason: 'end_turn' };
      })
      .connect(agentSide);

    const acp = await connectAgyClient(
      clientSide,
      handlers({
        requestPermission: (request) =>
          Promise.resolve({
            outcome: { outcome: 'selected', optionId: request.toolCall.title === 'rm -rf build' ? 'allow' : 'deny' },
          }),
      }),
    );

    const { sessionId } = await acp.newSession({ cwd: '/repo', mcpServers: [] });

    await acp.prompt({ sessionId, prompt: [{ type: 'text', text: 'clean' }] });
    expect(outcomes).toEqual([{ outcome: { outcome: 'selected', optionId: 'allow' } }]);

    acp.close();
  });

  it('cancels a turn: sends session/cancel and answers its pending permission request with cancelled', async () => {
    const { clientSide, agentSide } = streamPair();

    const cancelled = deferred<string>();
    const permissionAsked = deferred<undefined>();
    const outcomes: RequestPermissionResponse[] = [];

    agent()
      .onRequest('initialize', () => ({ protocolVersion: PROTOCOL_VERSION }))
      .onRequest('session/new', () => ({ sessionId: 's1' }))
      .onNotification('session/cancel', ({ params }) => {
        cancelled.resolve(params.sessionId);
      })
      .onRequest('session/prompt', async ({ params, client }) => {
        outcomes.push(
          await client.request('session/request_permission', {
            sessionId: params.sessionId,
            toolCall: { toolCallId: 't1', title: 'deploy' },
            options: [...PERMISSION_OPTIONS],
          }),
        );
        await cancelled.promise;
        return { stopReason: 'cancelled' };
      })
      .connect(agentSide);

    const acp = await connectAgyClient(
      clientSide,
      handlers({
        // Never decides on its own: only the cancellation can answer.
        requestPermission: () => {
          permissionAsked.resolve(undefined);
          return new Promise(() => {});
        },
      }),
    );

    const { sessionId } = await acp.newSession({ cwd: '/repo', mcpServers: [] });

    const turn = new AbortController();
    const response = acp.prompt({ sessionId, prompt: [{ type: 'text', text: 'deploy' }] }, turn.signal);

    await permissionAsked.promise;
    turn.abort();

    await expect(response).resolves.toEqual({ stopReason: 'cancelled' });
    await expect(cancelled.promise).resolves.toBe('s1');

    expect(outcomes).toEqual([{ outcome: { outcome: 'cancelled' } }]);

    acp.close();
  });

  it('refuses a server that answers another protocol version, and closes the connection', async () => {
    const { clientSide, agentSide } = streamPair();

    agent()
      .onRequest('initialize', () => ({ protocolVersion: PROTOCOL_VERSION + 1 }))
      .connect(agentSide);

    await expect(connectAgyClient(clientSide, handlers())).rejects.toThrow(
      `agy acp answered ACP protocol version ${PROTOCOL_VERSION + 1}`,
    );
  });
});
