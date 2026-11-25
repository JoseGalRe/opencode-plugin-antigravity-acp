import { client, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

import { CLIENT_INFO } from './client.types.ts';

import type { AgyClient, AgyClientHandlers } from './client.types.ts';
import type {
  InitializeResponse,
  PromptRequest,
  PromptResponse,
  RequestPermissionResponse,
  Stream,
} from '@agentclientprotocol/sdk';

const CANCELLED: RequestPermissionResponse = {
  outcome: {
    outcome: 'cancelled',
  },
};

/**
 * Connects to an ACP server over `stream`, runs `initialize`, and returns the client.
 *
 * @param stream The stream to connect to the ACP server.
 * @param handlers The handlers for the ACP client.
 *
 * @returns A promise that resolves to the ACP client.
 */
export async function connectAgyClient(stream: Stream, handlers: AgyClientHandlers): Promise<AgyClient> {
  // The cancellations of each session's running turn, which its permission requests follow.
  const turnSignals = new Map<string, AbortSignal>();

  const app = client({ name: CLIENT_INFO.name })
    .onNotification('session/update', ({ params }) => {
      handlers.onSessionUpdate(params);
    })
    .onRequest('session/request_permission', async ({ params, signal }) => {
      const turn = turnSignals.get(params.sessionId);
      const cancelled = turn ? AbortSignal.any([signal, turn]) : signal;

      if (cancelled.aborted) {
        return CANCELLED;
      }

      const whenCancelled = new Promise<RequestPermissionResponse>((resolve) => {
        cancelled.addEventListener('abort', () => resolve(CANCELLED), { once: true });
      });

      return Promise.race([handlers.requestPermission(params, cancelled), whenCancelled]);
    });

  const { fileSystem } = handlers;

  if (fileSystem) {
    app
      .onRequest('fs/read_text_file', ({ params, signal }) => fileSystem.readTextFile(params, signal))
      .onRequest('fs/write_text_file', ({ params, signal }) => fileSystem.writeTextFile(params, signal));
  }

  const connection = app.connect(stream);

  const { agent } = connection;

  let initialized: InitializeResponse;

  try {
    initialized = await agent.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: fileSystem !== undefined,
          writeTextFile: fileSystem !== undefined,
        },
        terminal: false,
      },
      clientInfo: CLIENT_INFO,
    });
  } catch (error: unknown) {
    connection.close(error);

    throw error;
  }

  if (initialized.protocolVersion !== PROTOCOL_VERSION) {
    const error = new Error(
      `agy acp answered ACP protocol version ${initialized.protocolVersion}; this plugin speaks version ${PROTOCOL_VERSION}`,
    );

    connection.close(error);

    throw error;
  }

  async function prompt(request: PromptRequest, signal?: AbortSignal): Promise<PromptResponse> {
    const turn = new AbortController();

    const cancel = () => {
      turn.abort();
      void agent.notify('session/cancel', { sessionId: request.sessionId }).catch(() => {
        // The connection is gone, and the pending prompt rejects with that.
      });
    };

    turnSignals.set(request.sessionId, turn.signal);

    if (signal?.aborted) {
      cancel();
    } else {
      signal?.addEventListener('abort', cancel, { once: true });
    }

    try {
      return await agent.request('session/prompt', request);
    } finally {
      signal?.removeEventListener('abort', cancel);

      if (turnSignals.get(request.sessionId) === turn.signal) {
        turnSignals.delete(request.sessionId);
      }
    }
  }

  return {
    agent: initialized,
    newSession: (request) => agent.request('session/new', request),
    loadSession: (request) => agent.request('session/load', request),
    resumeSession: (request) => agent.request('session/resume', request),
    closeSession: async (request) => {
      await agent.request('session/close', request);
    },
    setConfigOption: (request) => agent.request('session/set_config_option', request),
    prompt,
    closed: connection.closed,
    close: (error) => connection.close(error),
  };
}
