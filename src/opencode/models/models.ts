import { toModelId, toProviderId, toVariantId } from '../ids/ids.ts';

import { MODEL_OPTION_ID, PROVIDER_ID, THOUGHT_LEVEL_OPTION_ID } from './models.types.ts';

import type { AgyCatalog, AgyModel } from './models.types.ts';
import type { SessionConfigOption, SessionConfigSelectOption } from '@agentclientprotocol/sdk';
import type { Model } from '@opencode/plugin';

/**
 * The context window reported for a model until it has run a turn, in tokens. `agy` lists no window per model; it
 * reports the window in each turn's `usage_update` (1,048,576 for Gemini 4 Neon with agy 1.5.16), which then
 * replaces this.
 */
const CONTEXT_WINDOW = 1_048_576;

/**
 * The output limit reported for every model, in tokens; an assumption for the same reason as `CONTEXT_WINDOW`.
 */
const OUTPUT_LIMIT = 65_536;

/**
 * Reads the models and thinking levels from the config options of a `session/new` response, keeping only Gemini
 * models.
 *
 * @param configOptions The `configOptions` of `session/new`, `session/load` or `session/resume`.
 *
 * @returns The catalog; empty lists when an option is missing.
 */
export function readCatalog(configOptions: readonly SessionConfigOption[] | null | undefined): AgyCatalog {
  const models = selectValues(configOptions, MODEL_OPTION_ID)
    .filter((option) => isGeminiModel(option.value))
    .map((option) => ({ id: option.value, name: option.name }));

  const thoughtLevels = selectValues(configOptions, THOUGHT_LEVEL_OPTION_ID).map((option) => option.value);

  return { models, thoughtLevels };
}

/**
 * Reads a catalog saved in plugin storage, checking its shape and keeping only Gemini models again.
 *
 * @param value The stored JSON, or `undefined` when nothing was saved.
 *
 * @returns The catalog, or `undefined` when nothing usable was stored.
 */
export function parseCatalog(value: unknown): AgyCatalog | undefined {
  if (value === null || typeof value !== 'object' || !('models' in value) || !('thoughtLevels' in value)) {
    return undefined;
  }

  const { models, thoughtLevels } = value;

  if (!Array.isArray(models) || !Array.isArray(thoughtLevels)) {
    return undefined;
  }

  const parsed = models
    .filter(isAgyModel)
    .filter((model) => isGeminiModel(model.id))
    .map(({ id, name, contextWindow }) => (isTokenCount(contextWindow) ? { id, name, contextWindow } : { id, name }));

  return parsed.length > 0
    ? { models: parsed, thoughtLevels: thoughtLevels.filter((level) => typeof level === 'string') }
    : undefined;
}

/**
 * Keeps the context windows already learned when `agy` sends the catalog again: its config options carry no window,
 * so a fresh catalog would otherwise forget them.
 *
 * @param next The catalog `agy` just sent.
 * @param previous The catalog known so far, if any.
 *
 * @returns `next`, with each model's window from `previous` when `next` has none.
 */
export function keepContextWindows(next: AgyCatalog, previous: AgyCatalog | undefined): AgyCatalog {
  const windows = new Map(previous?.models.map((model) => [model.id, model.contextWindow]));

  return {
    models: next.models.map((model) => {
      const contextWindow = model.contextWindow ?? windows.get(model.id);

      return contextWindow === undefined ? model : { ...model, contextWindow };
    }),
    thoughtLevels: next.thoughtLevels,
  };
}

/**
 * Records the context window `agy` reported for a model.
 *
 * @param catalog The catalog known so far.
 * @param modelId The model that reported it (`gemini-4-neon`).
 * @param contextWindow The window in tokens.
 *
 * @returns The updated catalog, or `undefined` when nothing changes: unknown model, invalid window or same window.
 */
export function withContextWindow(catalog: AgyCatalog, modelId: string, contextWindow: number): AgyCatalog | undefined {
  const model = catalog.models.find(({ id }) => id === modelId);

  if (!model || !isTokenCount(contextWindow) || model.contextWindow === contextWindow) {
    return undefined;
  }

  return {
    models: catalog.models.map((known) => (known === model ? { ...known, contextWindow } : known)),
    thoughtLevels: catalog.thoughtLevels,
  };
}

/**
 * Whether a model ID names a Gemini model, Orchestrator variants included.
 *
 * @param id A model value from `agy` (`gemini-4-neon`, `claude-opus-5-5`).
 *
 * @returns `true` for IDs that start with `gemini`.
 */
export function isGeminiModel(id: string): boolean {
  return id.toLowerCase().startsWith('gemini');
}

/**
 * Describes one `agy` model to OpenCode, with a variant per thinking level.
 *
 * @param model The model from the catalog.
 * @param thoughtLevels The catalog's thinking levels.
 *
 * @returns The model definition for `ctx.provider.transform`.
 */
export function toModelInfo(model: AgyModel, thoughtLevels: readonly string[]): Model.Info {
  return {
    id: toModelId(model.id),
    modelID: toModelId(model.id),
    providerID: toProviderId(PROVIDER_ID),
    name: model.name,
    capabilities: {
      tools: true,
      // agy reads PDFs through a `resource_link` (verified with agy 1.5.16); audio and video are not tested.
      input: ['text', 'image', 'pdf'],
      output: ['text'],
    },
    variants: thoughtLevels.map((level) => ({ id: toVariantId(level) })),
    time: {
      released: 0,
    },
    cost: [],
    status: 'active',
    enabled: true,
    limit: {
      context: model.contextWindow ?? CONTEXT_WINDOW,
      output: OUTPUT_LIMIT,
    },
  };
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isAgyModel(value: unknown): value is AgyModel {
  return (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    'name' in value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  );
}

function selectValues(
  configOptions: readonly SessionConfigOption[] | null | undefined,
  id: string,
): readonly SessionConfigSelectOption[] {
  const option = configOptions?.find((candidate) => candidate.id === id);

  if (option?.type !== 'select') {
    return [];
  }

  return option.options.flatMap((entry) => ('group' in entry ? entry.options : [entry]));
}
