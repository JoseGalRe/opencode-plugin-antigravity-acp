import type { PermissionCheck } from './permission.types.ts';
import type {
  PermissionOption,
  PermissionOptionKind,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolKind,
} from '@agentclientprotocol/sdk';

/**
 * The OpenCode permission action for each ACP tool kind; kinds missing here use `antigravity`.
 */
const ACTIONS: Readonly<Partial<Record<ToolKind, string>>> = {
  read: 'read',
  edit: 'edit',
  delete: 'edit',
  move: 'edit',
  execute: 'shell',
  search: 'grep',
  fetch: 'webfetch',
};

const FALLBACK_ACTION = 'antigravity';

/**
 * The options to look for, best first, when the user allows or rejects. Only one-time answers: OpenCode keeps its own
 * "always" decisions, so `agy` is never told to remember one.
 */
const PREFERRED: Readonly<Record<'allow' | 'reject', readonly PermissionOptionKind[]>> = {
  allow: ['allow_once', 'allow_always'],
  reject: ['reject_once', 'reject_always'],
};

/**
 * Describes an `agy` permission request in the terms of OpenCode's permission rules.
 *
 * @param request The `session/request_permission` request.
 *
 * @returns The action, resources and prompt details for `ctx.permission.assert`.
 */
export function permissionCheckFor(request: RequestPermissionRequest): PermissionCheck {
  const { toolCall } = request;
  const kind = toolCall.kind ?? 'other';
  const action = ACTIONS[kind] ?? FALLBACK_ACTION;
  const title = toolCall.title ?? kind;

  return {
    action,
    resources: resourcesOf(
      action,
      title,
      toolCall.rawInput,
      toolCall.locations?.map((location) => location.path),
    ),
    metadata: { title, kind },
  };
}

/**
 * Answers a permission request with the option that matches the user's decision.
 *
 * @param options The options `agy` offered.
 * @param allowed Whether OpenCode allowed the action.
 *
 * @returns The selected option, or `cancelled` when `agy` offered none of that kind.
 */
export function answerPermission(options: readonly PermissionOption[], allowed: boolean): RequestPermissionResponse {
  for (const kind of PREFERRED[allowed ? 'allow' : 'reject']) {
    const option = options.find((candidate) => candidate.kind === kind);

    if (option) {
      return { outcome: { outcome: 'selected', optionId: option.optionId } };
    }
  }

  return { outcome: { outcome: 'cancelled' } };
}

function resourcesOf(action: string, title: string, rawInput: unknown, paths: readonly string[] | undefined): string[] {
  if (action === 'shell') {
    const command = stringField(rawInput, 'command');

    return [command ?? title];
  }

  if (paths && paths.length > 0) {
    return [...paths];
  }

  return [stringField(rawInput, 'path') ?? stringField(rawInput, 'url') ?? title];
}

function stringField(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object' || !(key in value)) {
    return undefined;
  }

  const field: unknown = Reflect.get(value, key);

  return typeof field === 'string' && field.length > 0 ? field : undefined;
}
