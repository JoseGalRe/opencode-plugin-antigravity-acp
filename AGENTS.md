# opencode-plugin-antigravity-acp

An OpenCode plugin that uses a Google Antigravity subscription through the official `agy acp` server, the Agent
Client Protocol (ACP) server that Antigravity CLI ships. The plugin is an ACP **client**, like Zed: it starts
`agy acp` as a subprocess and speaks JSON-RPC over its stdio.

## Boundaries that do not move

- The plugin never contacts Google or Antigravity itself. Every request to them is made by `agy`. The lint rule
  `no-restricted-imports` in `vite.config.ts` rejects network modules in `src/`; do not loosen it.
- Never read, copy or reuse `agy`'s credentials, and never call its backend (Cloud Code) directly. Sign-in goes
  through ACP `authenticate` or `agy acp --login`.
- `clientInfo` names this plugin (`CLIENT_INFO` in `src/acp/client.types.ts`). Never impersonate another editor to unlock
  models or features.
- Never change `--cloud_code_endpoint`. Default arguments are `DEFAULT_AGY_ARGS` in `src/agy/process.ts`.
- Advertise an ACP client capability only once it is implemented (`fs` follows its handlers; `terminal` is `false`).

## Layout

- `src/index.ts`: the package entry and the only build entry; explicit named re-exports, no side effects.
- `src/agy/process.ts`: starts `agy acp` and wraps its stdio as an ACP stream. Types in `process.types.ts`.
- `src/acp/client.ts`: the ACP client on the official SDK (`@agentclientprotocol/sdk`): `initialize`, sessions,
  turns with cancellation, permission requests and file access. Types in `client.types.ts`.
- `tests/fixtures/fake-agy.ts`: an ACP server on stdio that stands in for `agy` in tests.
- `scripts/smoke-agy.ts`: talks to the real `agy` without prompting (no quota): `node scripts/smoke-agy.ts --session`.

## Toolchain

Vite+ (`vp`) owns formatting, linting, the type check (tsrs, no `typescript` package), tests and hooks.

- Node `>=26.13.1` and pnpm `>=12.16.1` (`engines`; pnpm downloads Node 26.13.1 when the local one does not match).
- `pnpm install` runs `prepare` (`vp config --no-agent`), which points `core.hooksPath` at `.vite-hooks/_` so the
  hooks in `.vite-hooks/` run: `pre-commit` formats what is staged and runs `vp check --no-fmt`, `pre-push` runs
  `vp test`.
- `pnpm ready`: `vp check && vp test`. `pnpm build`: `vp pack` bundles `src/index.ts` into one ESM file,
  `dist/index.js`, with one `dist/index.d.ts`, for Node 26. Keep it a single entry; anything public is re-exported
  from `src/index.ts`.
- **Every dependency is bundled.** `dist/index.js` imports nothing but Node built-ins (`deps.onlyImport: []` fails the
  build otherwise), so it runs without `node_modules`, as a single plugin file. All packages are therefore
  `devDependencies`. The file's banner carries the licenses of what it bundles (`BUNDLED_LICENSES` in
  `vite.config.ts`): add a package there when it ends up in the bundle.
- Scripts: `test`, `lint:check` / `lint:fix`, `format:check` / `format:fix`, `smoke`. Name new ones `<tool>:<action>`.
- Scripts run directly with Node (`node scripts/x.ts`): keep code erasable, and write every relative import, `import
  type` included, with its `.ts` extension.
- Functions and closures only; no classes. Strict TypeScript; no `any`, `enum` or non-null assertions.
- `isolatedDeclarations` is on: every export carries an explicit type (`export const CLIENT_INFO: Implementation`,
  explicit return types), not an inferred or `as const satisfies` one.

## Code format

`vp fmt` settles spacing inside lines and import order within groups. These conventions are on top of it; follow them
in new code.

### Types and imports

- A module's contract lives in a sibling `<module>.types.ts` (`client.ts` → `client.types.ts`): its exported types
  and the constants that are part of that contract, such as `CLIENT_INFO`. The implementation file holds the
  behaviour and its private constants.
- Value imports never carry inline `type` modifiers. Types come in separate `import type` statements, placed after
  every value import: local `import type` first, then external ones. A value and a type from the same file are two
  statements.
- A module-level object constant is written one property per line, nested objects included.

```ts
import { client, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

import { CLIENT_INFO } from './client.types.ts';

import type { AgyClient, AgyClientHandlers } from './client.types.ts';
import type { InitializeResponse, Stream } from '@agentclientprotocol/sdk';

const CANCELLED: RequestPermissionResponse = {
  outcome: {
    outcome: 'cancelled',
  },
};
```

### Comments

- Comments on declarations, and on entries in config objects, are `/** */` blocks on their own lines, even for a
  single sentence. No one-line `/** text */`, and no `//` there.
- An exported function's JSDoc names its parameters and result with `@param` and `@returns`, after the description
  and a blank line.
- Every exported type has a JSDoc block, and so does **every property** of it, optional ones included. Say what the
  value is, its unit or range, what `null`, `undefined` or omission means, and who sets or reads it.
- A property whose type is a function documents it like a function: what it does, `@param` for each parameter,
  `@returns` unless it returns `void`, and an `@example` with a short, realistic ` ```ts ` snippet of how it is
  implemented (handlers) or called (methods). Document when it is called, what an abort or rejection does, and
  whether calling it twice is safe.
- `//` is for notes inside a function body only.
- No file-header comments: say what a file is for in this document or in its main export's JSDoc.

```ts
/**
 * Connects to an ACP server over `stream`, runs `initialize`, and returns the client.
 *
 * @param stream The stream to connect to the ACP server.
 * @param handlers The handlers for the ACP client.
 *
 * @returns A promise that resolves to the ACP client.
 */
```

A property in a `*.types.ts` file:

````ts
export type AgyClient = {
  /**
   * Sends `session/close`: ends a session on the server and frees what it holds. Closing an unknown session
   * resolves too.
   *
   * @param request The `sessionId` to close.
   *
   * @returns Resolves once the server has closed it.
   *
   * @example
   * ```ts
   * await acp.closeSession({ sessionId });
   * ```
   */
  readonly closeSession: (request: CloseSessionRequest) => Promise<void>;
  /**
   * Settles when the connection has closed, from either side.
   */
  readonly closed: Promise<void>;
};
````

### Blank lines

Group statements into blocks separated by one blank line:

- `let` and `const` declarations are separate blocks.
- A destructuring declaration (`const { agent } = connection;`) is its own block.
- A declaration initialized by an array or object literal (`const written: string[] = [];`) is its own block.
- A declaration whose initializer spans several lines (a multi-line call, an arrow function) is its own block.
- Single-line declarations that belong together stay together (`const cancelled = deferred(); const asked = …`).
- A blank line before `throw` or `return` that follows a side-effect statement (`connection.close(error);`).
- In tests, consecutive `expect` calls about the same thing form a block; separate blocks with a blank line, and leave
  one before the closing cleanup (`acp.close();`).
- In `vite.config.ts`, no blank lines between top-level keys; the `pack` section lists its keys alphabetically.

## Verified facts about `agy acp` (1.5.16, 2026-11-24)

- ACP protocol version 1; `agentInfo.name` is `Antigravity ACP Server`.
- Capabilities: `loadSession`; sessions `resume`, `close`, `load`, `list`, `additionalDirectories`; prompts with images
  and embedded context, no audio; `_meta.antigravity.systemPrompt.append`. No MCP http/sse unless
  `--process-per-session`.
- `session/new` returns config options `model` (Gemini, Claude and GPT-OSS models are offered to this client),
  `thought_level` (`low`, `medium`, `high`, `xhigh`) and `mode` (`default`, `accept-edits`, `auto`, `plan`).
