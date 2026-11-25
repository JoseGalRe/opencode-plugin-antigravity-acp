import { homedir } from 'node:os';

import { acquireAgyRuntime } from '../../agy/pool/pool.ts';
import { DEFAULT_AGY_ARGS } from '../../agy/process/process.ts';
import { toProviderId } from '../../opencode/ids/ids.ts';
import { createLanguageModel } from '../../opencode/language-model/language-model.ts';
import { SESSION_HEADER, VARIANT_HEADER } from '../../opencode/language-model/language-model.types.ts';
import { keepContextWindows, parseCatalog, toModelInfo, withContextWindow } from '../../opencode/models/models.ts';
import { PROVIDER_ID } from '../../opencode/models/models.types.ts';
import { answerPermission, permissionCheckFor } from '../../opencode/permission/permission.ts';
import { readOptions } from '../options/options.ts';

import type { RequestPermission } from '../../agy/runtime/runtime.types.ts';
import type { LanguageModel } from '../../opencode/ai-sdk/ai-sdk.types.ts';
import type { AgyCatalog } from '../../opencode/models/models.types.ts';
import type { Model, Plugin } from '@opencode/plugin';
import type { AISDKHooks } from '@opencode/plugin/promise/aisdk';
import type { SessionHooks } from '@opencode/plugin/promise/session';

/**
 * The provider package OpenCode is told about. The `aisdk:` prefix routes it through the AI SDK hooks, where this
 * plugin supplies the language model, so nothing is ever installed under this name.
 */
const PROVIDER_PACKAGE = 'aisdk:opencode-plugin-antigravity-acp';

/**
 * The compaction recorded instead of a summary: `agy` keeps the conversation's context itself, and summarizing it
 * with `agy` would be a non-interactive call.
 */
const COMPACTION_SUMMARY = 'Antigravity keeps the context of this conversation in its own session.';

/**
 * The longest title taken from the first user message, in characters.
 */
const TITLE_LENGTH = 60;

const FALLBACK_TITLE = 'Antigravity session';

/**
 * The plugin-storage key of the last catalog `agy` sent, registered at once on the next start.
 */
const CATALOG_KEY = 'catalog';

/**
 * How long the first start, with no saved catalog, waits for `agy` to list its models before going on without them,
 * in milliseconds. The read carries on in the background and registers them when it ends.
 */
const FIRST_DISCOVERY_TIMEOUT = 20_000;

/**
 * Scopes every hook to the `antigravity` provider: other providers' requests never reach them.
 */
const HOOK_OPTIONS = {
  providerID: PROVIDER_ID,
} as const;

type SessionMessages = Awaited<ReturnType<Plugin.Context['session']['context']>>;

/**
 * Sets the plugin up in one OpenCode location: the `antigravity` provider, the language models behind it, and the
 * session hooks that keep `agy` to interactive turns (see the terms-of-service section of AGENTS.md).
 *
 * @param context The plugin context OpenCode passes.
 *
 * @returns The cleanup that releases this location's share of `agy`; the last location to release it ends the process.
 */
export async function setup(context: Plugin.Context): Promise<() => Promise<void>> {
  const options = readOptions(context.options);

  // Every location of this OpenCode server shares one `agy`: its sessions name their own directories.
  const lease = acquireAgyRuntime({
    process: {
      command: options.command,
      args: [...DEFAULT_AGY_ARGS, ...options.args],
      cwd: homedir(),
    },
    log,
  });

  const { runtime } = lease;

  const requestPermission: RequestPermission = async (request, sessionID) => {
    const check = permissionCheckFor(request);

    try {
      await context.permission.assert({
        sessionID,
        action: check.action,
        resources: [...check.resources],
        metadata: { ...check.metadata },
      });

      return answerPermission(request.options, true);
    } catch (error: unknown) {
      log(`${check.action} refused`, error);

      return answerPermission(request.options, false);
    }
  };

  const languageModels = new Map<string, LanguageModel>();

  const languageModel = (modelId: string): LanguageModel => {
    let model = languageModels.get(modelId);

    if (!model) {
      model = createLanguageModel(modelId, {
        runtime,
        directory: context.location.directory,
        requestPermission,
        onContextWindow: learnContextWindow,
      });
      languageModels.set(modelId, model);
    }

    return model;
  };

  const saved = parseCatalog(await context.storage.get(CATALOG_KEY).catch(() => undefined));

  let catalog = saved;
  let models: readonly Model.Info[] = saved ? toModels(saved) : [];

  // OpenCode sends `default` when no variant is chosen: only `agy`'s own levels are passed on.
  let thoughtLevels = new Set(saved?.thoughtLevels);

  // Catalog changes apply one at a time, so a slower reload or save never overwrites a newer one.
  let applying = Promise.resolve();

  function apply(next: AgyCatalog): Promise<void> {
    const changed = JSON.stringify(next) !== JSON.stringify(catalog);

    catalog = next;

    if (!changed) {
      return applying;
    }

    const write = async () => {
      models = toModels(next);
      thoughtLevels = new Set(next.thoughtLevels);

      try {
        await context.provider.reload();
        await context.storage.set(CATALOG_KEY, {
          models: next.models.map((model) => ({ ...model })),
          thoughtLevels: [...next.thoughtLevels],
        });
      } catch (error: unknown) {
        log('could not register the models agy offers', error);
      }
    };

    applying = applying.then(write);

    return applying;
  }

  function learnCatalog(next: AgyCatalog): void {
    void apply(keepContextWindows(next, catalog));
  }

  function learnContextWindow(modelId: string, contextWindow: number): void {
    const next = catalog && withContextWindow(catalog, modelId, contextWindow);

    if (next) {
      void apply(next);
    }
  }

  function sdkCallback(input: AISDKHooks['sdk']): void {
    input.sdk = { languageModel };
  }

  function languageCallback(input: AISDKHooks['language']): void {
    input.language = languageModel(input.model.id);
  }

  async function modelRequestCallback(event: SessionHooks['model.request']): Promise<void> {
    if (event.kind === 'generate') {
      throw new Error('Antigravity serves your own turns only, not background generation');
    }

    if (event.kind === 'primary') {
      const session = await context.session.get({ sessionID: event.sessionID });

      if (session.parentID) {
        throw new Error('Antigravity serves your own turns only, not subagents');
      }
    }

    event.headers[SESSION_HEADER] = event.sessionID;

    if (event.model.variant && thoughtLevels.has(event.model.variant)) {
      event.headers[VARIANT_HEADER] = event.model.variant;
    }
  }

  async function titleCallback(event: SessionHooks['title']): Promise<void> {
    // `event.messages` holds OpenCode's title prompt, not the conversation: read the session's own messages.
    const messages = await context.session.context({ sessionID: event.sessionID }).catch((error: unknown) => {
      log('could not read the session for its title', error);

      return [];
    });

    event.result = titleFrom(messages);
  }

  // Every session `agy` opens sends the catalog again: a saved one is refreshed by the first real turn.
  const stopWatching = runtime.watchCatalog(learnCatalog);

  try {
    await context.provider.transform((editor) => {
      editor.add({
        info: {
          id: toProviderId(PROVIDER_ID),
          name: 'Antigravity',
          activation: 'enabled',
          package: PROVIDER_PACKAGE,
        },
        models,
      });
    });

    await context.aisdk.hook('sdk', sdkCallback, HOOK_OPTIONS);
    await context.aisdk.hook('language', languageCallback, HOOK_OPTIONS);
    await context.session.hook('model.request', modelRequestCallback, HOOK_OPTIONS);
    await context.session.hook('title', titleCallback, HOOK_OPTIONS);
    await context.session.hook('compaction', compactionCallback, HOOK_OPTIONS);
  } catch (error: unknown) {
    stopWatching();
    await lease.release();

    throw error;
  }

  if (!saved) {
    // Nothing saved: `agy` must start now to list its models. A request made right after start would find no model,
    // so wait, within reason; the read carries on in the background and registers them when it ends.
    const discovery = runtime
      .catalog()
      .then((read) => apply(keepContextWindows(read, catalog)))
      .catch((error: unknown) => log('could not read the models agy offers', error));

    await Promise.race([discovery, delay(FIRST_DISCOVERY_TIMEOUT)]);
  }

  return async () => {
    stopWatching();
    await lease.release();
  };
}

function compactionCallback(event: SessionHooks['compaction']): void {
  event.result = { summary: COMPACTION_SUMMARY };
}

function toModels(catalog: AgyCatalog): readonly Model.Info[] {
  return catalog.models.map((model) => toModelInfo(model, catalog.thoughtLevels));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds).unref();
  });
}

function log(message: string, detail?: unknown): void {
  console.warn(`[antigravity] ${message}`, detail ?? '');
}

function titleFrom(messages: SessionMessages): string {
  for (const message of messages) {
    const text = message.type === 'user' ? message.text.trim() : '';

    if (text.length > 0) {
      return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1)}…` : text;
    }
  }

  return FALLBACK_TITLE;
}
