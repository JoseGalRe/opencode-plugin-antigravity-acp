import type { Model } from '@opencode/plugin';

/**
 * OpenCode's branded ID of a model variant (`high`). OpenCode's ID schemas brand plain strings without refinements, so
 * any non-empty string is a valid ID; `toVariantId` turns `agy`'s thinking levels into it.
 */
export type VariantID = Model.Info['variants'][number]['id'];
