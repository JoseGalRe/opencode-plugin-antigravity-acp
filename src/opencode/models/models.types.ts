/**
 * The provider ID under which the models appear in OpenCode, as in `antigravity/gemini-4-neon`.
 */
export const PROVIDER_ID = 'antigravity';

/**
 * The ACP session config option that selects the model.
 */
export const MODEL_OPTION_ID = 'model';

/**
 * The ACP session config option that selects the thinking level; its values become OpenCode model variants.
 */
export const THOUGHT_LEVEL_OPTION_ID = 'thought_level';

/**
 * One model `agy` offers, as listed in the `model` config option of `session/new`.
 */
export type AgyModel = {
  /**
   * The option value `agy` expects in `session/set_config_option`, also used as the OpenCode model ID
   * (`gemini-4-neon`).
   */
  readonly id: string;
  /**
   * The display name `agy` gives it (`Gemini 4 Neon`).
   */
  readonly name: string;
};

/**
 * What `agy` offers this client: the models it may use and the thinking levels they accept.
 */
export type AgyCatalog = {
  /**
   * The models offered, already limited to Gemini (see the terms-of-service section of AGENTS.md). Empty when `agy`
   * listed none.
   */
  readonly models: readonly AgyModel[];
  /**
   * The values of the `thought_level` option (`low`, `medium`, `high`, `xhigh`), in `agy`'s order. Empty when `agy`
   * has no such option.
   */
  readonly thoughtLevels: readonly string[];
};
