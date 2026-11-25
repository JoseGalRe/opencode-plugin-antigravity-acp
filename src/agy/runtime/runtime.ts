import { connectAgyClient } from '../../acp/client/client.ts';
import { readCatalog } from '../../opencode/models/models.ts';
import { spawnAgy } from '../process/process.ts';

import type { AgyClient } from '../../acp/client/client.types.ts';
import type { AgyCatalog } from '../../opencode/models/models.types.ts';
import type {
  AgyConnection,
  AgyRuntime,
  AgyRuntimeOptions,
  AgySession,
  RequestPermission,
  SessionOwner,
} from './runtime.types.ts';
import type { SessionConfigOption, SessionUpdate } from '@agentclientprotocol/sdk';

/**
 * Creates the runtime. Nothing starts until the first call that needs `agy`.
 *
 * @param options How to start `agy acp` and where its diagnostics go.
 *
 * @returns The runtime.
 */
export function createAgyRuntime(options: AgyRuntimeOptions): AgyRuntime {
  // Turn listeners by ACP session ID, and the OpenCode session (with its permission handler) each belongs to.
  const listeners = new Map<string, (update: SessionUpdate) => void>();
  const owners = new Map<string, SessionOwner>();
  const sessions = new Map<string, Promise<AgySession>>();
  const catalogListeners = new Set<(catalog: AgyCatalog) => void>();

  let connection: Promise<AgyConnection> | undefined;
  let catalog: Promise<AgyCatalog> | undefined;

  // Which process the current state belongs to, so the exit of an older one does not clear it.
  let generation = 0;

  function reset(): void {
    connection = undefined;
    listeners.clear();
    owners.clear();
    sessions.clear();
  }

  function announce(configOptions: readonly SessionConfigOption[] | null | undefined): AgyCatalog {
    const read = readCatalog(configOptions);

    if (read.models.length > 0) {
      for (const listener of catalogListeners) {
        listener(read);
      }
    }

    return read;
  }

  async function start(): Promise<AgyConnection> {
    const agy = spawnAgy({
      ...options.process,
      onStderr: (text) => options.log('agy stderr', text.trimEnd()),
    });

    generation += 1;

    const started = generation;

    const watchExit = async () => {
      try {
        options.log('agy acp exited', await agy.exited);
      } catch (error: unknown) {
        options.log('agy acp could not start', error);
      }

      if (generation === started) {
        reset();
      }
    };

    void watchExit();

    try {
      const client = await connectAgyClient(agy.stream, {
        onSessionUpdate: ({ sessionId, update }) => listeners.get(sessionId)?.(update),
        requestPermission: (request, signal) => {
          const owner = owners.get(request.sessionId);

          return owner
            ? owner.requestPermission(request, owner.sessionID, signal)
            : Promise.resolve({ outcome: { outcome: 'cancelled' } });
        },
      });

      return { agy, client };
    } catch (error: unknown) {
      agy.kill();

      throw error;
    }
  }

  function connect(): Promise<AgyConnection> {
    connection ??= start().catch((error: unknown) => {
      reset();

      throw error;
    });

    return connection;
  }

  function bind(client: AgyClient, id: string, configOptions: readonly SessionConfigOption[] | null | undefined) {
    const values = new Map<string, string>();

    for (const option of configOptions ?? []) {
      if (option.type === 'select') {
        values.set(option.id, option.currentValue);
      }
    }

    const session: AgySession = {
      id,
      configure: async (configId, value) => {
        if (values.get(configId) === value) {
          return;
        }

        await client.setConfigOption({ sessionId: id, configId, value });
        values.set(configId, value);
      },
      prompt: async (prompt, onUpdate, signal) => {
        listeners.set(id, onUpdate);

        try {
          return await client.prompt({ sessionId: id, prompt: [...prompt] }, signal);
        } finally {
          if (listeners.get(id) === onUpdate) {
            listeners.delete(id);
          }
        }
      },
    };

    return session;
  }

  async function open(sessionID: string, cwd: string, requestPermission: RequestPermission): Promise<AgySession> {
    const { client } = await connect();
    const created = await client.newSession({ cwd, mcpServers: [] });

    owners.set(created.sessionId, { sessionID, requestPermission });
    announce(created.configOptions);

    return bind(client, created.sessionId, created.configOptions);
  }

  async function readAgyCatalog(): Promise<AgyCatalog> {
    const { client } = await connect();
    const created = await client.newSession({ cwd: options.process.cwd, mcpServers: [] });

    await client.closeSession({ sessionId: created.sessionId });

    return announce(created.configOptions);
  }

  return {
    catalog: () => {
      catalog ??= readAgyCatalog().catch((error: unknown) => {
        catalog = undefined;

        throw error;
      });

      return catalog;
    },
    watchCatalog: (listener) => {
      catalogListeners.add(listener);

      return () => {
        catalogListeners.delete(listener);
      };
    },
    session: (sessionID, cwd, requestPermission) => {
      let session = sessions.get(sessionID);

      if (!session) {
        session = open(sessionID, cwd, requestPermission);
        sessions.set(sessionID, session);
        session.catch(() => {
          if (sessions.get(sessionID) === session) {
            sessions.delete(sessionID);
          }
        });
      }

      return session;
    },
    forget: async (sessionID) => {
      const session = sessions.get(sessionID);

      if (!session || !connection) {
        return;
      }

      sessions.delete(sessionID);

      const [{ client }, { id }] = await Promise.all([connection, session]);

      owners.delete(id);
      listeners.delete(id);
      await client.closeSession({ sessionId: id });
    },
    dispose: async () => {
      const current = connection;

      generation += 1;
      reset();
      catalog = undefined;
      catalogListeners.clear();

      if (current) {
        const { agy, client } = await current.catch(() => ({ agy: undefined, client: undefined }));

        client?.close();
        agy?.kill();
      }
    },
  };
}
