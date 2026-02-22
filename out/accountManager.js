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
exports.AccountManager = void 0;
const vscode = __importStar(require("vscode"));
const os = __importStar(require("os"));
const sshConfigParser_1 = require("./sshConfigParser");
const gitCommands_1 = require("./gitCommands");
const sshKeys_1 = require("./sshKeys");
// ──────────────────────────────────────────────────────────
// Account Manager
// ──────────────────────────────────────────────────────────
class AccountManager {
    constructor() {
        this.repoRoot = this.detectRepoRoot();
    }
    // ── Repository root ────────────────────────────────────
    detectRepoRoot() {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }
    /** Call this whenever the workspace folders change. */
    updateRepoRoot() {
        this.repoRoot = this.detectRepoRoot();
    }
    // ── Account list ───────────────────────────────────────
    /** Accounts persisted in VSCode settings. */
    getConfiguredAccounts() {
        const cfg = vscode.workspace.getConfiguration('githubAccountSwitcher');
        return cfg.get('accounts') ?? [];
    }
    /**
     * Merged account list: VSCode-configured accounts **plus** any
     * GitHub Host entries found in ~/.ssh/config that are not already listed.
     * The canonical `github.com` host is always included as a fallback entry.
     */
    async getAllAccounts() {
        const configured = this.getConfiguredAccounts();
        const sshConfig = await (0, sshConfigParser_1.readSshConfig)();
        const githubHosts = (0, sshConfigParser_1.findGithubHosts)(sshConfig);
        const merged = [...configured];
        // Promote SSH-only hosts (not yet in settings) as lightweight entries.
        for (const host of githubHosts) {
            const already = configured.some(a => a.hostAlias === host.alias);
            if (!already && host.alias !== 'github.com') {
                merged.push({
                    name: deriveNameFromAlias(host.alias),
                    hostAlias: host.alias,
                    keyPath: host.identityFile ?? '',
                });
            }
        }
        // Ensure the default github.com host is always reachable.
        const hasDefault = merged.some(a => a.hostAlias === 'github.com');
        if (!hasDefault) {
            const defaultSshHost = githubHosts.find(h => h.alias === 'github.com');
            merged.unshift({
                name: 'Default (github.com)',
                hostAlias: 'github.com',
                keyPath: defaultSshHost?.identityFile ?? `${os.homedir()}/.ssh/id_ed25519`,
                default: true,
            });
        }
        return merged;
    }
    // ── Current account detection ──────────────────────────
    /**
     * Determine which account is active for the current repository by comparing
     * the remote host alias to the known account list.
     */
    async getCurrentAccount() {
        if (!this.repoRoot) {
            return null;
        }
        const remoteInfo = await (0, gitCommands_1.getRemoteInfo)(this.repoRoot);
        if (!remoteInfo?.isSSH || !remoteInfo.hostAlias) {
            return null;
        }
        const accounts = await this.getAllAccounts();
        return accounts.find(a => a.hostAlias === remoteInfo.hostAlias) ?? null;
    }
    /** Raw remote URL information for the current repository. */
    async getCurrentRemoteInfo() {
        if (!this.repoRoot) {
            return null;
        }
        return (0, gitCommands_1.getRemoteInfo)(this.repoRoot);
    }
    // ── Account switching ──────────────────────────────────
    /**
     * Switch the current repository to use the supplied account.
     * Steps:
     *  1. Determine which remote to update (prompts when multiple remotes exist).
     *  2. Rewrite the remote URL host alias.
     *  3. Optionally sync git config user.name / user.email.
     *  4. Optionally test the new SSH connection.
     */
    async switchAccount(account) {
        if (!this.repoRoot) {
            throw new Error('No repository is open.');
        }
        const remotes = await (0, gitCommands_1.getRemotes)(this.repoRoot);
        if (remotes.length === 0) {
            throw new Error('No git remotes found in this repository.');
        }
        // Pick the remote to update.
        let targetRemote = remotes.find(r => r.name === 'origin');
        if (!targetRemote && remotes.length === 1) {
            targetRemote = remotes[0];
        }
        if (!targetRemote && remotes.length > 1) {
            const picks = remotes.map(r => ({
                label: r.name,
                description: r.url,
            }));
            const chosen = await vscode.window.showQuickPick(picks, {
                placeHolder: 'Multiple remotes found – select which one to update',
            });
            if (!chosen) {
                throw new Error('No remote selected – switch cancelled.');
            }
            targetRemote = remotes.find(r => r.name === chosen.label);
        }
        if (!targetRemote) {
            throw new Error('Could not determine which remote to update.');
        }
        const parsed = parseHostAlias(targetRemote.url);
        if (!parsed.isSSH) {
            throw new Error('The remote uses HTTPS. Convert it to SSH before switching accounts.');
        }
        const newUrl = (0, gitCommands_1.buildRemoteUrl)(targetRemote.url, account.hostAlias);
        await (0, gitCommands_1.setRemoteUrl)(this.repoRoot, targetRemote.name, newUrl);
        // Optionally update git user config.
        const cfg = vscode.workspace.getConfiguration('githubAccountSwitcher');
        if (cfg.get('syncGitConfigOnSwitch')) {
            await this.syncGitConfig(account);
        }
        // Optionally verify the new connection.
        if (cfg.get('testConnectionOnSwitch')) {
            const result = await (0, gitCommands_1.testSshConnection)(account.hostAlias);
            if (!result.success) {
                vscode.window.showWarningMessage(`Switched to "${account.name}" but the SSH test failed: ${result.output}`);
            }
        }
    }
    // ── Git config sync ────────────────────────────────────
    /** Write user.name and/or user.email to the local git config. */
    async syncGitConfig(account) {
        if (!this.repoRoot) {
            return;
        }
        if (account.username) {
            await (0, gitCommands_1.setGitConfig)(this.repoRoot, 'user.name', account.username);
        }
        if (account.email) {
            await (0, gitCommands_1.setGitConfig)(this.repoRoot, 'user.email', account.email);
        }
    }
    // ── SSH connection test ────────────────────────────────
    async testConnection(account) {
        return (0, gitCommands_1.testSshConnection)(account.hostAlias);
    }
    // ── Add account interactively ──────────────────────────
    /**
     * Walk the user through prompts to define a new account.
     * Offers to generate the SSH key pair automatically, writes a Host block
     * to ~/.ssh/config, and persists the account to VSCode settings.
     */
    async addAccountInteractive() {
        // ── Step 1: display name ──────────────────────────────
        const name = await vscode.window.showInputBox({
            title: 'New GitHub Account (1/4) – Name',
            prompt: 'Display name for this account',
            placeHolder: 'Agency',
            validateInput: v => (v.trim() ? null : 'Name cannot be empty.'),
        });
        if (name === undefined) {
            return null;
        }
        // ── Step 2: email ─────────────────────────────────────
        const email = await vscode.window.showInputBox({
            title: 'New GitHub Account (2/4) – Email',
            prompt: 'GitHub email address for this account',
            placeHolder: 'you@agency.com',
            validateInput: v => (v.trim() ? null : 'Email cannot be empty.'),
        });
        if (email === undefined) {
            return null;
        }
        // ── Step 3: GitHub username ───────────────────────────
        const username = await vscode.window.showInputBox({
            title: 'New GitHub Account (3/4) – GitHub Username',
            prompt: 'Your GitHub username (synced to git config user.name)',
            placeHolder: 'your-github-username',
        });
        if (username === undefined) {
            return null;
        }
        // ── Step 4: SSH key – generate or pick existing ───────
        const suggestedKeyPath = `~/.ssh/id_ed25519_${name.trim().toLowerCase().replace(/\s+/g, '_')}`;
        const keyChoice = await vscode.window.showQuickPick([
            {
                label: '$(key) Generate a new SSH key for me',
                description: `will create ${suggestedKeyPath}`,
                value: 'generate',
            },
            {
                label: '$(folder-opened) I already have an SSH key',
                description: 'let me choose the path',
                value: 'existing',
            },
        ], { title: 'New GitHub Account (4/4) – SSH Key', placeHolder: 'How do you want to set up the SSH key?' });
        if (keyChoice === undefined) {
            return null;
        }
        let keyPath = suggestedKeyPath;
        if (keyChoice.value === 'existing') {
            // Let user confirm or override the path.
            const entered = await vscode.window.showInputBox({
                title: 'Existing SSH Key Path',
                prompt: 'Path to your private key file',
                value: suggestedKeyPath,
                placeHolder: '~/.ssh/id_ed25519_agency',
            });
            if (entered === undefined) {
                return null;
            }
            keyPath = entered.trim();
        }
        else {
            // ── Auto-generate the key pair ──────────────────────
            const alreadyExists = await (0, sshKeys_1.keyExists)(suggestedKeyPath);
            if (alreadyExists) {
                const overwrite = await vscode.window.showWarningMessage(`A key already exists at ${suggestedKeyPath}. Overwrite it?`, { modal: true }, 'Overwrite', 'Use existing');
                if (overwrite === undefined) {
                    return null;
                }
                if (overwrite === 'Use existing') {
                    // Skip generation, keep the existing key.
                }
                else {
                    await runKeyGeneration(suggestedKeyPath, email.trim());
                }
            }
            else {
                await runKeyGeneration(suggestedKeyPath, email.trim());
            }
            keyPath = suggestedKeyPath;
            // Show the public key and offer to copy + open GitHub.
            const pubKey = await (0, sshKeys_1.readPublicKey)(keyPath);
            if (pubKey) {
                await showPublicKeyPanel(pubKey, name.trim());
            }
        }
        // ── Build account object ──────────────────────────────
        const suggestedAlias = `github.com-${name.trim().toLowerCase().replace(/\s+/g, '-')}`;
        const account = {
            name: name.trim(),
            hostAlias: suggestedAlias,
            keyPath,
            email: email.trim() || undefined,
            username: username.trim() || undefined,
        };
        // ── Write Host block to ~/.ssh/config ─────────────────
        const sshHost = {
            alias: account.hostAlias,
            hostname: 'github.com',
            user: 'git',
            identityFile: account.keyPath,
            identitiesOnly: true,
            raw: [],
        };
        await (0, sshConfigParser_1.appendSshHost)(sshHost);
        // ── Persist to VSCode global settings ─────────────────
        const cfg = vscode.workspace.getConfiguration('githubAccountSwitcher');
        const existing2 = cfg.get('accounts') ?? [];
        await cfg.update('accounts', [...existing2, account], vscode.ConfigurationTarget.Global);
        return account;
    }
}
exports.AccountManager = AccountManager;
// ──────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────
/**
 * Run ssh-keygen with a progress notification.
 * Throws on failure so the caller can surface the error message.
 */
async function runKeyGeneration(keyPath, email) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Generating SSH key at ${keyPath}…`,
        cancellable: false,
    }, async () => {
        try {
            await (0, sshKeys_1.generateSshKey)(keyPath, email);
        }
        catch (err) {
            throw new Error(`ssh-keygen failed: ${err.message}`);
        }
    });
}
/**
 * Show the public key to the user, copy it to the clipboard, and offer to
 * open GitHub's "Add SSH key" page so they can paste it in immediately.
 */
async function showPublicKeyPanel(pubKey, accountName) {
    await vscode.env.clipboard.writeText(pubKey);
    const action = await vscode.window.showInformationMessage(`SSH key for "${accountName}" generated and copied to clipboard!\n` +
        `Now add it to GitHub → Settings → SSH keys.`, 'Open GitHub SSH Settings', 'Show Key');
    if (action === 'Open GitHub SSH Settings') {
        await vscode.env.openExternal(vscode.Uri.parse('https://github.com/settings/ssh/new'));
    }
    else if (action === 'Show Key') {
        // Open a temporary read-only document with the public key text.
        const doc = await vscode.workspace.openTextDocument({
            content: pubKey,
            language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    }
}
/** Derive a human-friendly display name from an SSH alias like "github.com-agency". */
function deriveNameFromAlias(alias) {
    const stripped = alias
        .replace(/^github\.com[-.]/, '') // remove leading "github.com-" or "github.com."
        .replace(/[-_]/g, ' '); // replace separators with spaces
    // Title-case each word.
    return stripped.replace(/\b\w/g, c => c.toUpperCase()) || alias;
}
/** Thin shim so switchAccount can check isSSH without importing gitCommands directly. */
function parseHostAlias(url) {
    return { isSSH: /^git@/.test(url) || /^ssh:\/\//.test(url) };
}
//# sourceMappingURL=accountManager.js.map