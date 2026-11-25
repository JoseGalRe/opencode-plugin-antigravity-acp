import { toModelId, toProviderId, toVariantId } from '../ids/ids.ts';

import { MODEL_OPTION_ID, PROVIDER_ID, THOUGHT_LEVEL_OPTION_ID } from './models.types.ts';

import type { AgyCatalog, AgyModel } from './models.types.ts';
import type { SessionConfigOption, SessionConfigSelectOption } from '@agentclientprotocol/sdk';
import type { Model } from '@opencode/plugin';

/**
 * The context window reported for every model, in tokens. `agy` does not list it per model; this is the window of
 * current Gemini models and an assumption until `agy` reports one.
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

  const parsed = models.filter(isAgyModel).filter((model) => isGeminiModel(model.id));

  return parsed.length > 0
    ? { models: parsed, thoughtLevels: thoughtLevels.filter((level) => typeof level === 'string') }
    : undefined;
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
      input: ['text', 'image'],
      output: ['text'],
    },
    variants: thoughtLevels.map((level) => ({ id: toVariantId(level) })),
    time: { released: 0 },
    cost: [],
    status: 'active',
    enabled: true,
    limit: { context: CONTEXT_WINDOW, output: OUTPUT_LIMIT },
  };
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
