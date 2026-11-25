# opencode-plugin-antigravity-acp

An OpenCode plugin that uses a Google Antigravity subscription through the official `agy acp` server, the Agent
Client Protocol (ACP) server that Antigravity CLI ships. The plugin is an ACP **client**, like Zed: it starts
`agy acp` as a subprocess and speaks JSON-RPC over its stdio.

## Boundaries that do not move

- The plugin never contacts Google or Antigravity itself. Every request to them is made by `agy`. The lint rule
  `no-restricted-imports` in `vite.config.ts` rejects network modules in `src/`; do not loosen it.
- Never read, copy or reuse `agy`'s credentials, and never call its backend (Cloud Code) directly. Sign-in goes
  through ACP `authenticate` or `agy acp --login`.
- `clientInfo` names this plugin (`CLIENT_INFO` in `src/acp/client/client.types.ts`). Never impersonate another
  editor to unlock models or features.
- Never change `--cloud_code_endpoint`. Default arguments are `DEFAULT_AGY_ARGS` in `src/agy/process/process.ts`.
- Advertise an ACP client capability only once it is implemented (`fs` follows its handlers; `terminal` is `false`).

## Terms of service: the path this plugin stays on (decided 2026-11-24)

Antigravity's terms (§6) call using third-party software to access the service a breach, and the FAQ names OpenCode
as an example. The only allowance found is a reply on Google's forum (thread 197131, 2026-11-02): the official,
unmodified ACP binary inside an ACP client such as Zed or T3 Code, signed in with `oauth-personal`, for single-user
interactive development and the Gemini models in the plan, "is compliant and will not cause a suspension". The same
thread's question about OpenCode specifically is unanswered. Antigravity's own ACP guide also says that "any ACP
client can launch Antigravity CLI" with `agy acp`, and this plugin is exactly that: an ACP client of the unmodified
`agy acp`. It still keeps to the forum's description:

- **`agy`'s own tools only.** OpenCode shows tool calls and answers permission requests; `agy` executes. Do not pass
  OpenCode's tools to `agy` (no `mcpServers` built from OpenCode, no `--ide-mcp-port`) without a new decision.
- **Gemini models only** when signed in with `oauth-personal`. `agy` 1.5.16 offers this client Claude and GPT-OSS
  too, but Google's reply reserves them for first-party surfaces: filter them out.
- **Interactive turns only.** `agy` answers the user's own turns. Never route OpenCode's background calls to it: titles,
  summaries, compaction, subagents, scheduled or automated runs.
- **API key is different.** With `gemini-api-key` the FAQ's recommended path for third-party agents applies; these
  limits are about the subscription sign-in.

Revisit this section when Google answers or the terms change.

## Layout

`src/` has one folder per domain (`acp`, `agy`, `opencode`, `plugin`) and, inside it, one folder per module that holds
the module, its `*.types.ts` and its `*.test.ts`: `src/opencode/turn/turn.ts`, `turn.types.ts`, `turn.test.ts`. A new
module gets its own folder the same way; nothing but `src/index.ts` sits directly in `src/` or in a domain folder.

- `src/index.ts`: the package and build entry. Its default export is the OpenCode server plugin (`{ id, setup }`);
  it exports nothing else.
- `src/plugin/setup/`: registers the `antigravity` provider, supplies its language models through the `aisdk` hooks,
  and adds the session hooks that keep `agy` to interactive turns. `src/plugin/options/` reads the plugin options
  (`command`, `args`).
- `src/opencode/`: the OpenCode side. `language-model/` is the AI SDK `LanguageModelV3` whose `doStream` runs one ACP
  turn; `prompt/` turns OpenCode's prompt into ACP blocks; `turn/` turns ACP updates into stream parts; `models/`
  reads `agy`'s catalog; `permission/` maps permission requests to OpenCode's rules; `ids/` types OpenCode's branded
  IDs; `ai-sdk/` derives the AI SDK types from OpenCode's.
- `src/agy/runtime/`: one `agy acp` process, started on first use: the catalog, one ACP session per OpenCode
  session, update routing, and each session's permission handler (the location that opened it).
- `src/agy/pool/`: shares one runtime among the plugin instances of an OpenCode server (one per location) through
  explicit leases; the last release ends `agy`.
- `src/agy/process/`: starts `agy acp` and wraps its stdio as an ACP stream.
- `src/acp/client/`: the ACP client on the official SDK (`@agentclientprotocol/sdk`): `initialize`, sessions, config
  options, turns with cancellation, permission requests and file access.
- `tests/fixtures/fake-agy.ts`: an ACP server on stdio shaped like `agy` 1.5.16 (config options, thoughts, a tool
  call, usage, a permission request on demand) that stands in for `agy` in tests.
- `scripts/smoke-agy.ts`: talks to the real `agy` without prompting (no quota): `node scripts/smoke-agy.ts --session`.

## Toolchain

Vite+ (`vp`) owns formatting, linting, the type check (tsrs, no `typescript` package), tests and hooks.

- Node `>=26.13.1` and pnpm `>=12.16.1` (`engines`; pnpm downloads Node 26.13.1 when the local one does not match).
- `pnpm install` runs `prepare` (`vp config --no-agent`), which points `core.hooksPath` at `.vite-hooks/_` so the
  hooks in `.vite-hooks/` run: `pre-commit` formats what is staged and runs `vp check --no-fmt`, `pre-push` runs
  `vp test`.
- `pnpm ready`: `vp check && vp test`. `pnpm build`: `vp pack` bundles `src/index.ts` into one minified ESM file,
  `dist/index.js`, for Node 26, with no declarations (`dts: false`: nothing imports a plugin's types). Keep it a
  single entry.
- `@opencode/plugin` is used for types only (`import type`): OpenCode provides its own modules to plugins, and
  importing a value from it would bundle Effect and OpenCode's schemas. Like Chester, the plugin is a plain object.
- `zod` is bundled because the ACP SDK validates with it. It cannot be swapped for `zod/mini`: the SDK imports
  `zod/v4` and its generated schemas use the chained API (`.optional()`, `.default()`, `.transform()`).
- **Every dependency is bundled.** `dist/index.js` imports nothing but Node built-ins (`deps.onlyImport: []` fails the
  build otherwise), so it runs without `node_modules`, as a single plugin file. All packages are therefore
  `devDependencies`. The file's banner carries the licenses of what it bundles (`BUNDLED_LICENSES` in
  `vite.config.ts`): add a package there when it ends up in the bundle.
- Scripts: `test`, `lint:check` / `lint:fix`, `format:check` / `format:fix`, `cspell:check`, `smoke`, `release`.
  Name new ones `<tool>:<action>`.
- CI (`.gitea/workflows/ci.yml`) runs `pnpm ready` and `pnpm build` on every push to `main` and every pull request,
  on the self-hosted `linux` runner. It publishes nothing.

## Releases

Every new version ships as a Gitea release, with its notes and the plugin file ready to install:

1. Bump `version` in `package.json` and write its `## <version>` section in `CHANGELOG.md` (`### Minor Changes` or
   `### Patch Changes`, one bullet per change, written for the user).
2. Commit.
3. Run `GITEA_TOKEN=… pnpm release` (`scripts/release.ts`). It refuses uncommitted tracked changes, a missing
   CHANGELOG section, or a tag `v<version>` that points elsewhere. It pushes the branch and the tag (created on HEAD
   when missing), builds again (`pnpm run build`), and creates or updates the release on Gitea
   (`http://127.0.0.1:7531`; `GITEA_URL` overrides) with that section as its notes and `dist/index.js` attached as
   `opencode-plugin-antigravity-acp-<version>.js`. `pnpm release --dry-run` only checks and prints.

The attached file is the whole plugin: dropped into `~/.config/opencode/plugins/`, OpenCode loads it with the default
options (verified with 0.1.0).

- Scripts run directly with Node (`node scripts/x.ts`): keep code erasable, and write every relative import, `import
  type` included, with its `.ts` extension.
- Functions and closures only; no classes. Strict TypeScript; no `any`, `enum` or non-null assertions.
- `isolatedDeclarations` is on: every export carries an explicit type (`export const CLIENT_INFO: Implementation`,
  explicit return types), not an inferred or `as const satisfies` one.

## Code format

`vp fmt` settles spacing inside lines and import order within groups. These conventions are on top of it; follow them
in new code.

### Types and imports

- A module's contract lives in a sibling `<module>.types.ts` in its folder (`client/client.ts` →
  `client/client.types.ts`): its exported types and the constants that are part of that contract, such as
  `CLIENT_INFO`. The implementation file holds the behavior and its private constants.
- Every type lives in the `*.types.ts`, also the ones only the module uses (aliases and internal state shapes): an
  implementation or script file declares no `type`. Each type has a JSDoc, and so does each of its properties.
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

### OpenCode hooks

- Each hook callback is a named function, `<hook>Callback` (`sdkCallback`, `modelRequestCallback`), typed with its
  domain's hook map: `AISDKHooks['sdk']` from `@opencode/plugin/promise/aisdk`, `SessionHooks['model.request']` from
  `@opencode/plugin/promise/session`, and so on. No `unknown` and no inline arrow in the `hook(...)` call.
- A callback that uses setup state is declared inside `setup`, before the registrations; one that uses nothing sits at
  module level (`compactionCallback`).
- The registrations are one line each, sharing `HOOK_OPTIONS` (`{ providerID: PROVIDER_ID }`).

```ts
function sdkCallback(input: AISDKHooks['sdk']): void {
  input.sdk = { languageModel };
}

await context.aisdk.hook('sdk', sdkCallback, HOOK_OPTIONS);
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
- `session/new` returns config options `model` (Gemini, Claude and GPT-OSS models are offered to this client; only
  Gemini is used with `oauth-personal`, see Terms of service),
  `thought_level` (`low`, `medium`, `high`, `xhigh`) and `mode` (`default`, `accept-edits`, `auto`, `plan`).
- `session/new` also returns the plan in `_meta.antigravity.tier` (`{ name, id, upgradeUri }`), and each session sends
  `usage_update` with `used` and the context window `size` (1,048,576). Nothing in ACP reports remaining quota.
- `session/prompt` answers with `usage` (unstable in ACP, missing from the SDK's stable types): per-turn counts where
  `inputTokens` excludes `cachedReadTokens`, `outputTokens` includes `thoughtTokens`, and `totalTokens` equals the
  turn's last `usage_update.used`. The `usage_update` arrives before the response. Resuming a session sends none.
- Sessions persist on disk: a new `agy` process lists them (`session/list` by `cwd`) and reopens them with
  `session/resume`.
- Each `agy` process listens on two loopback ports of its own (one HTTPS, one HTTP) and starts the MCP servers of the
  user's Antigravity configuration as children; that is the weight of each process, not the plugin.

## Verified facts about OpenCode (2.4.1, 2026-11-24)

Checked against the OpenCode binary and with the built plugin in `opencode run --standalone` against
`tests/fixtures/fake-agy.ts`. The `aisdk` hooks are not in the public plugin docs: recheck them on OpenCode upgrades.

- A provider whose `package` starts with `aisdk:` goes through the AI SDK route. OpenCode runs the `aisdk` `sdk`
  hooks and fails with "No AISDK provider plugin returned an SDK" when none sets `input.sdk`; then the `language`
  hooks, using `input.language ?? sdk.languageModel(id)`. Nothing is installed for the package name.
- `doStream` receives the headers set in the `model.request` hook, OpenCode's own `x-opencode-session-id`, and the
  `context` hook's extra `options` under `providerOptions[providerID]`.
- Tool calls with `providerExecuted: true`, followed by their `tool-result`, show as completed tools.
- The `title` and `compaction` hooks skip the model call when they set `result`; `model.request` still runs for them
  (with `kind` `title` or `compaction`), so it must not reject those kinds. `event.messages` in the `title` hook holds
  OpenCode's title prompt, not the conversation: read `ctx.session.context` for the user's first message.
- With no variant chosen, `event.model.variant` is `default`: pass only `agy`'s own thinking levels.
- A message's recorded input is the `finish` usage's `inputTokens.noCache`, not `total`; its output is
  `outputTokens.total` minus `reasoning`. With `noCache` missing the session shows 0 tokens and 0% context.
- Permission actions are V2 names: commands are `shell` (V1's `bash`). A rule with no match means `ask`; a `deny`
  rule rejects `ctx.permission.assert` even under `opencode run --auto`.
- Models registered after setup (`ctx.provider.reload()`) may come too late for a request made right at start:
  setup waits for the first discovery when no catalog is saved. With a saved catalog setup starts nothing.
- OpenCode runs `setup` once per location (project directory) in the same server process: per-instance state there
  multiplies, which is why `agy` is pooled.
- In a test server, run OpenCode under `env -i` with temporary `XDG_*` directories: inherited `OPENCODE_CONFIG` and
  `OPENCODE_CLIENT` otherwise load the parent instance's configuration and plugins.
