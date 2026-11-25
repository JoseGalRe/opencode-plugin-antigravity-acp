/**
 * The action `agy` asks permission for, in the terms of OpenCode's permission rules.
 */
export type PermissionCheck = {
  /**
   * The OpenCode permission action whose rules apply: `read`, `edit`, `shell`, `grep`, `webfetch`, or `antigravity`
   * for tools OpenCode has no action for.
   */
  readonly action: string;
  /**
   * What the action touches, matched against the rules' patterns: file paths, the command line for `shell`, or the
   * tool call's title when `agy` names nothing more specific. Never empty.
   */
  readonly resources: readonly string[];
  /**
   * Details shown in OpenCode's permission prompt: the tool call's title and its ACP kind.
   */
  readonly metadata: {
    /**
     * The title `agy` gave the tool call (`Run npm test`).
     */
    readonly title: string;
    /**
     * The ACP tool kind (`execute`, `edit`, …), or `other` when `agy` gave none.
     */
    readonly kind: string;
  };
};
