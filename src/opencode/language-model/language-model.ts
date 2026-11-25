import { MODEL_OPTION_ID, PROVIDER_ID, THOUGHT_LEVEL_OPTION_ID } from '../models/models.types.ts';
import { toAcpPrompt } from '../prompt/prompt.ts';
import { createTurnTranslator } from '../turn/turn.ts';

import { SESSION_HEADER, VARIANT_HEADER } from './language-model.types.ts';

import type { CallOptions, LanguageModel, StreamPart, StreamResult } from '../ai-sdk/ai-sdk.types.ts';
import type { LanguageModelContext } from './language-model.types.ts';
import type { SessionUpdate } from '@agentclientprotocol/sdk';

/**
 * Creates the AI SDK language model OpenCode streams one `agy` model through. Each `doStream` call is one turn of the
 * ACP session that belongs to the OpenCode session in its headers.
 *
 * @param modelId The `agy` model value (`gemini-4-neon`), selected on the session before each turn.
 * @param context The runtime and the directory sessions work in.
 *
 * @returns The language model for the `aisdk` `language` hook.
 */
export function createLanguageModel(modelId: string, context: LanguageModelContext): LanguageModel {
  async function doStream(options: CallOptions): Promise<StreamResult> {
    const sessionID = header(options.headers, SESSION_HEADER);

    if (!sessionID) {
      throw new Error(`Antigravity needs the OpenCode session; the ${SESSION_HEADER} header is missing`);
    }

    const prompt = toAcpPrompt(options.prompt);

    if (prompt.length === 0) {
      throw new Error('Antigravity runs a turn only for new user input; this request has none');
    }

    const session = await context.runtime.session(sessionID, context.directory, context.requestPermission);

    await session.configure(MODEL_OPTION_ID, modelId);

    const variant = header(options.headers, VARIANT_HEADER);

    if (variant) {
      await session.configure(THOUGHT_LEVEL_OPTION_ID, variant);
    }

    const turn = new AbortController();

    const abortTurn = () => turn.abort();

    options.abortSignal?.addEventListener('abort', abortTurn, { once: true });

    let open = true;

    const stream = new ReadableStream<StreamPart>({
      start: (controller) => {
        const emit = (parts: readonly StreamPart[]) => {
          for (const part of parts) {
            if (open) {
              controller.enqueue(part);
            }
          }
        };

        const run = async () => {
          const translator = createTurnTranslator();

          emit([{ type: 'stream-start', warnings: [] }]);

          try {
            const onUpdate = (update: SessionUpdate) => {
              if (update.sessionUpdate === 'usage_update' && update.size > 0) {
                context.onContextWindow(modelId, update.size);
              }

              emit(translator.update(update));
            };

            const response = await session.prompt(prompt, onUpdate, turn.signal);

            emit(translator.finish(response));
          } catch (error: unknown) {
            emit([{ type: 'error', error }]);
          } finally {
            options.abortSignal?.removeEventListener('abort', abortTurn);

            if (open) {
              open = false;
              controller.close();
            }
          }
        };

        void run();
      },
      cancel: () => {
        open = false;
        turn.abort();
      },
    });

    return { stream };
  }

  return {
    specificationVersion: 'v3',
    provider: PROVIDER_ID,
    modelId,
    supportedUrls: {},
    doGenerate: () => Promise.reject(new Error('Antigravity models stream their turns; use doStream')),
    doStream,
  };
}

function header(headers: CallOptions['headers'], name: string): string | undefined {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === name && value) {
      return value;
    }
  }

  return undefined;
}
