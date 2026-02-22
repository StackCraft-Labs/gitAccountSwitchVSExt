"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandKeyPath = expandKeyPath;
exports.keyExists = keyExists;
exports.readPublicKey = readPublicKey;
exports.generateSshKey = generateSshKey;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const fsSync = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
// ──────────────────────────────────────────────────────────
// Platform: locate ssh-keygen binary
// ──────────────────────────────────────────────────────────
function resolveSshKeygenBinary() {
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
function expandKeyPath(keyPath) {
    return keyPath.replace(/^~/, os.homedir());
}
/** Return true when the private key file already exists on disk. */
async function keyExists(keyPath) {
    try {
        await fs.access(expandKeyPath(keyPath));
        return true;
    }
    catch {
        return false;
    }
}
/** Read the public key (.pub) for a given private key path. Returns null when not found. */
async function readPublicKey(keyPath) {
    try {
        const content = await fs.readFile(expandKeyPath(keyPath) + '.pub', 'utf-8');
        return content.trim();
    }
    catch {
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
async function generateSshKey(keyPath, email, passphrase = '') {
    const absPath = expandKeyPath(keyPath);
    // Make sure the target directory exists (~/.ssh).
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await execFileAsync(SSH_KEYGEN, [
        '-t', 'ed25519',
        '-C', email,
        '-f', absPath,
        '-N', passphrase, // empty = no passphrase
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
//# sourceMappingURL=sshKeys.js.map