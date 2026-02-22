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
exports.SSH_CONFIG_PATH = void 0;
exports.readSshConfig = readSshConfig;
exports.parseSshConfig = parseSshConfig;
exports.appendSshHost = appendSshHost;
exports.findGithubHosts = findGithubHosts;
exports.sshConfigExists = sshConfigExists;
const fs = __importStar(require("fs/promises"));
const fsSync = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Resolve the SSH config path cross-platform.
exports.SSH_CONFIG_PATH = path.join(os.homedir(), '.ssh', 'config');
const SSH_DIR = path.join(os.homedir(), '.ssh');
// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────
/** Read and parse ~/.ssh/config. Returns empty result when the file is absent. */
async function readSshConfig() {
    let content;
    try {
        content = await fs.readFile(exports.SSH_CONFIG_PATH, 'utf-8');
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return { hosts: [], rawContent: '' };
        }
        throw err;
    }
    return parseSshConfig(content);
}
/** Parse raw SSH config text into structured hosts. */
function parseSshConfig(content) {
    const hosts = [];
    const lines = content.split(/\r?\n/);
    let currentHost = null;
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
        }
        else if (currentHost) {
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
async function appendSshHost(host) {
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
        await fs.appendFile(exports.SSH_CONFIG_PATH, block, 'utf-8');
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            await fs.writeFile(exports.SSH_CONFIG_PATH, block.trimStart(), 'utf-8');
            // Restrict permissions on Unix (SSH silently ignores world-readable configs).
            if (process.platform !== 'win32') {
                await fs.chmod(exports.SSH_CONFIG_PATH, 0o600);
            }
        }
        else {
            throw err;
        }
    }
}
/**
 * Return only the SSH hosts that reference github.com.
 * This covers the canonical "github.com" host as well as any alias hosts
 * whose HostName is "github.com".
 */
function findGithubHosts(config) {
    return config.hosts.filter(h => h.alias === 'github.com' ||
        h.hostname === 'github.com' ||
        h.alias.startsWith('github.com-') ||
        h.alias.startsWith('github.com.'));
}
/** Check (synchronously, so it can be used inside other sync helpers) whether the SSH config file exists. */
function sshConfigExists() {
    return fsSync.existsSync(exports.SSH_CONFIG_PATH);
}
//# sourceMappingURL=sshConfigParser.js.map