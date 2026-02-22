import { execFile } from 'child_process';
import * as fsSync from 'fs';
import { promisify } from 'util';
import { GitRemote, RemoteInfo } from './types';

const execFileAsync = promisify(execFile);

// ──────────────────────────────────────────────────────────
// Platform helpers
// ──────────────────────────────────────────────────────────

/**
 * Locate the ssh binary to use.
 * On Windows we prefer the one bundled with Git for Windows; if that is not
 * present we fall back to the system `ssh` (OpenSSH ships with Windows 10+).
 */
function resolveSshBinary(): string {
  if (process.platform !== 'win32') {
    return 'ssh';
  }

  const candidates = [
    'C:\\Program Files\\Git\\usr\\bin\\ssh.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\ssh.exe',
  ];

  for (const p of candidates) {
    if (fsSync.existsSync(p)) {
      return p;
    }
  }

  // Fall back to the system ssh (available in Windows 10+ via Optional Features).
  return 'ssh';
}

const SSH_BINARY = resolveSshBinary();

// ──────────────────────────────────────────────────────────
// URL helpers
// ──────────────────────────────────────────────────────────

/**
 * Parse a git remote URL and extract the SSH host alias and repo path.
 *
 * Supported formats:
 *   git@github.com-alias:user/repo.git   (SCP-like, most common)
 *   ssh://git@github.com/user/repo.git   (explicit ssh:// scheme)
 */
export function parseRemoteUrl(
  url: string
): { hostAlias: string | null; repoPath: string | null; isSSH: boolean } {
  // SCP-like: git@<host>:<path>
  const scpMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (scpMatch) {
    return { hostAlias: scpMatch[1], repoPath: scpMatch[2], isSSH: true };
  }

  // ssh:// scheme
  const sshUrlMatch = url.match(/^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshUrlMatch) {
    return { hostAlias: sshUrlMatch[1], repoPath: sshUrlMatch[2], isSSH: true };
  }

  return { hostAlias: null, repoPath: null, isSSH: false };
}

/**
 * Rebuild a remote URL replacing only the host alias portion.
 * The `.git` suffix is always preserved.
 */
export function buildRemoteUrl(originalUrl: string, newHostAlias: string): string {
  const parsed = parseRemoteUrl(originalUrl);
  if (!parsed.isSSH || !parsed.repoPath) {
    throw new Error(
      `Cannot build an SSH URL from a non-SSH remote: ${originalUrl}`
    );
  }
  return `git@${newHostAlias}:${parsed.repoPath}.git`;
}

// ──────────────────────────────────────────────────────────
// Git remote operations
// ──────────────────────────────────────────────────────────

/** Return all remotes defined in the repository. */
export async function getRemotes(repoRoot: string): Promise<GitRemote[]> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', '-v'], {
      cwd: repoRoot,
    });

    const remotes = new Map<string, string>();
    for (const line of stdout.trim().split(/\r?\n/)) {
      // Only process fetch lines to avoid duplicates.
      const m = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)/);
      if (m) {
        remotes.set(m[1], m[2]);
      }
    }

    return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
  } catch {
    // No git repo or no remotes – return empty rather than throwing.
    return [];
  }
}

/**
 * Return parsed information about a specific remote (defaults to "origin").
 * Falls back to the first remote if "origin" is not found.
 */
export async function getRemoteInfo(
  repoRoot: string,
  remoteName = 'origin'
): Promise<RemoteInfo | null> {
  const remotes = await getRemotes(repoRoot);
  if (remotes.length === 0) {
    return null;
  }

  const remote = remotes.find(r => r.name === remoteName) ?? remotes[0];
  const parsed = parseRemoteUrl(remote.url);

  return {
    remote,
    hostAlias: parsed.hostAlias,
    repoPath: parsed.repoPath,
    isSSH: parsed.isSSH,
  };
}

/** Update the URL of a named remote. */
export async function setRemoteUrl(
  repoRoot: string,
  remoteName: string,
  newUrl: string
): Promise<void> {
  await execFileAsync('git', ['remote', 'set-url', remoteName, newUrl], {
    cwd: repoRoot,
  });
}

// ──────────────────────────────────────────────────────────
// Git config
// ──────────────────────────────────────────────────────────

/** Write a local git config key/value pair. */
export async function setGitConfig(
  repoRoot: string,
  key: string,
  value: string
): Promise<void> {
  await execFileAsync('git', ['config', key, value], { cwd: repoRoot });
}

/** Read a git config value; returns null when the key is unset. */
export async function getGitConfig(
  repoRoot: string,
  key: string
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['config', key], {
      cwd: repoRoot,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// SSH connectivity test
// ──────────────────────────────────────────────────────────

/**
 * Run `ssh -T git@<hostAlias>` and return whether the handshake succeeded.
 *
 * GitHub returns exit code 1 even on a successful authentication
 * ("Hi <user>! You've successfully authenticated…"), so we detect
 * success by inspecting the output rather than the exit code.
 */
export async function testSshConnection(
  hostAlias: string
): Promise<{ success: boolean; output: string }> {
  const args = [
    '-T',
    '-o', 'BatchMode=yes',          // Never prompt for a passphrase.
    '-o', 'StrictHostKeyChecking=no', // Accept unknown host keys (first-run friendly).
    '-o', 'ConnectTimeout=8',
    `git@${hostAlias}`,
  ];

  try {
    const { stdout, stderr } = await execFileAsync(SSH_BINARY, args, {
      timeout: 12_000,
    });
    const output = (stdout + stderr).trim();
    return { success: isSuccessfulSshOutput(output), output };
  } catch (err: any) {
    // ssh exits with code 1 on a successful GitHub auth – collect the output.
    const output = (
      (err.stdout ?? '') + (err.stderr ?? '')
    ).trim();
    return { success: isSuccessfulSshOutput(output), output };
  }
}

/** Heuristic: GitHub prints "Hi <name>!" or "successfully authenticated" on success. */
function isSuccessfulSshOutput(output: string): boolean {
  return (
    output.includes('successfully authenticated') ||
    output.toLowerCase().startsWith('hi ')
  );
}
