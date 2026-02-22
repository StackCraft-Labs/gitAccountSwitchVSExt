/**
 * A configured GitHub SSH account.
 */
export interface Account {
  /** Display name shown in the status bar and quick pick (e.g. "Agency", "Personal"). */
  name: string;
  /** SSH host alias matching a `Host` entry in ~/.ssh/config (e.g. "github.com-agency"). */
  hostAlias: string;
  /** Absolute or `~`-prefixed path to the private key file. */
  keyPath: string;
  /** When true this is treated as the fallback account for plain `github.com` remotes. */
  default?: boolean;
  /** Email synced to `git config user.email` on switch. */
  email?: string;
  /** GitHub username synced to `git config user.name` on switch. */
  username?: string;
}

/**
 * A single `Host` block parsed from ~/.ssh/config.
 */
export interface SshHost {
  alias: string;
  hostname?: string;
  user?: string;
  identityFile?: string;
  identitiesOnly?: boolean;
  /** Raw lines belonging to this block (used for round-trip writing). */
  raw: string[];
}

export interface ParsedSshConfig {
  hosts: SshHost[];
  rawContent: string;
}

/**
 * A git remote entry (name + URL pair).
 */
export interface GitRemote {
  name: string;
  url: string;
}

/**
 * Parsed information about a single git remote URL.
 */
export interface RemoteInfo {
  remote: GitRemote;
  /** SSH host alias extracted from the URL, or null for HTTPS remotes. */
  hostAlias: string | null;
  /** "user/repo" path portion. */
  repoPath: string | null;
  isSSH: boolean;
}
