import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SshHost, ParsedSshConfig } from './types';

// Resolve the SSH config path cross-platform.
export const SSH_CONFIG_PATH = path.join(os.homedir(), '.ssh', 'config');
const SSH_DIR = path.join(os.homedir(), '.ssh');

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

/** Read and parse ~/.ssh/config. Returns empty result when the file is absent. */
export async function readSshConfig(): Promise<ParsedSshConfig> {
  let content: string;
  try {
    content = await fs.readFile(SSH_CONFIG_PATH, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { hosts: [], rawContent: '' };
    }
    throw err;
  }
  return parseSshConfig(content);
}

/** Parse raw SSH config text into structured hosts. */
export function parseSshConfig(content: string): ParsedSshConfig {
  const hosts: SshHost[] = [];
  const lines = content.split(/\r?\n/);
  let currentHost: SshHost | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Blank lines and comments belong to the current block (or are ignored before first Host).
    if (trimmed === '' || trimmed.startsWith('#')) {
      currentHost?.raw.push(line);
      continue;
    }

    // Match "Key Value" or "Key=Value"
    const match = trimmed.match(/^([A-Za-z]+)\s*[= ]\s*(.+)$/);
    if (!match) {
      currentHost?.raw.push(line);
      continue;
    }

    const [, rawKey, rawValue] = match;
    const key = rawKey.toLowerCase();
    const value = rawValue.trim();

    if (key === 'host') {
      if (currentHost) {
        hosts.push(currentHost);
      }
      currentHost = { alias: value, raw: [line] };
    } else if (currentHost) {
      currentHost.raw.push(line);
      switch (key) {
        case 'hostname':
          currentHost.hostname = value;
          break;
        case 'user':
          currentHost.user = value;
          break;
        case 'identityfile':
          // Normalise ~ to the real home directory so the rest of the code can
          // use the path directly without further substitution.
          currentHost.identityFile = value.replace(/^~/, os.homedir());
          break;
        case 'identitiesonly':
          currentHost.identitiesOnly = value.toLowerCase() === 'yes';
          break;
      }
    }
  }

  if (currentHost) {
    hosts.push(currentHost);
  }

  return { hosts, rawContent: content };
}

/**
 * Append a new Host block to ~/.ssh/config.
 * Creates the file (and .ssh directory) if they do not exist.
 */
export async function appendSshHost(host: SshHost): Promise<void> {
  await fs.mkdir(SSH_DIR, { recursive: true });

  // Represent the key path with ~ so the config is portable across machines.
  const keyPath = host.identityFile
    ? host.identityFile.replace(os.homedir(), '~')
    : '~/.ssh/id_ed25519';

  const block = [
    '',
    `Host ${host.alias}`,
    `    HostName ${host.hostname ?? 'github.com'}`,
    `    User ${host.user ?? 'git'}`,
    `    IdentityFile ${keyPath}`,
    `    IdentitiesOnly yes`,
    '',
  ].join('\n');

  try {
    await fs.appendFile(SSH_CONFIG_PATH, block, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(SSH_CONFIG_PATH, block.trimStart(), 'utf-8');
      // Restrict permissions on Unix (SSH silently ignores world-readable configs).
      if (process.platform !== 'win32') {
        await fs.chmod(SSH_CONFIG_PATH, 0o600);
      }
    } else {
      throw err;
    }
  }
}

/**
 * Return only the SSH hosts that reference github.com.
 * This covers the canonical "github.com" host as well as any alias hosts
 * whose HostName is "github.com".
 */
export function findGithubHosts(config: ParsedSshConfig): SshHost[] {
  return config.hosts.filter(
    h =>
      h.alias === 'github.com' ||
      h.hostname === 'github.com' ||
      h.alias.startsWith('github.com-') ||
      h.alias.startsWith('github.com.')
  );
}

/** Check (synchronously, so it can be used inside other sync helpers) whether the SSH config file exists. */
export function sshConfigExists(): boolean {
  return fsSync.existsSync(SSH_CONFIG_PATH);
}
