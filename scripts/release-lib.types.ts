/**
 * A Gitea repository, as named in a Git remote.
 */
export type Repository = {
  /**
   * The user or organization that owns it (`josegalre`).
   */
  readonly owner: string;
  /**
   * The repository's name, without `.git` (`opencode-plugin-antigravity-acp`).
   */
  readonly name: string;
};
