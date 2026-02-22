import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ──────────────────────────────────────────────────────────
// Platform: locate ssh-keygen binary
// ──────────────────────────────────────────────────────────

function resolveSshKeygenBinary(): string {
  if (process.platform !== 'win32') {
    return 'ssh-keygen';
  }
  const candidates = [
    'C:\\Program Files\\Git\\usr\\bin\\ssh-keygen.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\ssh-keygen.exe',
  ];
  for (const p of candidates) {
    if (fsSync.existsSync(p)) {
      return p;
    }
  }
  // Windows 10+ ships OpenSSH
  return 'ssh-keygen';
}

const SSH_KEYGEN = resolveSshKeygenBinary();

// ──────────────────────────────────────────────────────────
// Public helpers
// ──────────────────────────────────────────────────────────

/** Expand a `~`-prefixed path to an absolute path. */
export function expandKeyPath(keyPath: string): string {
  return keyPath.replace(/^~/, os.homedir());
}

/** Return true when the private key file already exists on disk. */
export async function keyExists(keyPath: string): Promise<boolean> {
  try {
    await fs.access(expandKeyPath(keyPath));
    return true;
  } catch {
    return false;
  }
}

/** Read the public key (.pub) for a given private key path. Returns null when not found. */
export async function readPublicKey(keyPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(expandKeyPath(keyPath) + '.pub', 'utf-8');
    return content.trim();
  } catch {
    return null;
  }
}

/**
 * Generate a new ed25519 SSH key pair.
 *
 * @param keyPath   Private key destination (~ is expanded automatically).
 * @param email     Comment / label embedded in the public key.
 * @param passphrase  Leave empty string for no passphrase.
 * @returns The generated public key string.
 */
export async function generateSshKey(
  keyPath: string,
  email: string,
  passphrase = ''
): Promise<string> {
  const absPath = expandKeyPath(keyPath);

  // Make sure the target directory exists (~/.ssh).
  await fs.mkdir(path.dirname(absPath), { recursive: true });

  await execFileAsync(SSH_KEYGEN, [
    '-t', 'ed25519',
    '-C', email,
    '-f', absPath,
    '-N', passphrase,   // empty = no passphrase
  ]);

  // Set restrictive permissions on Unix (.ssh keys must not be world-readable).
  if (process.platform !== 'win32') {
    await fs.chmod(absPath, 0o600);
    await fs.chmod(absPath + '.pub', 0o644);
  }

  const pubKey = await readPublicKey(keyPath);
  if (!pubKey) {
    throw new Error(`Key was generated but public key file was not found at ${absPath}.pub`);
  }
  return pubKey;
}
