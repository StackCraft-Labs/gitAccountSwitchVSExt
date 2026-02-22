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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const accountManager_1 = require("./accountManager");
const statusBar_1 = require("./statusBar");
const quickPick_1 = require("./quickPick");
const sshConfigParser_1 = require("./sshConfigParser");
const gitCommands_1 = require("./gitCommands");
// ──────────────────────────────────────────────────────────
// Extension-level singletons
// ──────────────────────────────────────────────────────────
let accountManager;
let statusBar;
// ──────────────────────────────────────────────────────────
// Activation
// ──────────────────────────────────────────────────────────
function activate(context) {
    accountManager = new accountManager_1.AccountManager();
    statusBar = new statusBar_1.StatusBarManager();
    // Register all commands.
    context.subscriptions.push(vscode.commands.registerCommand('github-account.switch', cmdSwitch), vscode.commands.registerCommand('github-account.add', cmdAdd), vscode.commands.registerCommand('github-account.testCurrent', cmdTestCurrent), vscode.commands.registerCommand('github-account.editSshConfig', cmdEditSshConfig), vscode.commands.registerCommand('github-account.syncGitConfig', cmdSyncGitConfig));
    // Keep the status bar in sync when the workspace or settings change.
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        accountManager.updateRepoRoot();
        void refreshStatusBar();
    }), vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('githubAccountSwitcher')) {
            void refreshStatusBar();
        }
    }));
    // Register the status bar item for disposal on deactivation.
    context.subscriptions.push(statusBar);
    // Initial refresh.
    void refreshStatusBar();
}
// ──────────────────────────────────────────────────────────
// Deactivation
// ──────────────────────────────────────────────────────────
function deactivate() {
    // Resources are cleaned up via context.subscriptions.
}
// ──────────────────────────────────────────────────────────
// Status bar refresh
// ──────────────────────────────────────────────────────────
async function refreshStatusBar() {
    statusBar.setLoading();
    try {
        const remoteInfo = await accountManager.getCurrentRemoteInfo();
        if (!remoteInfo) {
            statusBar.showNoRepo();
            return;
        }
        if (!remoteInfo.isSSH) {
            statusBar.showHttps();
            return;
        }
        const current = await accountManager.getCurrentAccount();
        if (current) {
            statusBar.showAccount(current);
        }
        else {
            statusBar.showUnknown(remoteInfo.hostAlias ?? '?');
        }
    }
    catch {
        // Even on error, keep the item visible so the user can click to retry.
        statusBar.showNoRepo();
    }
}
// ──────────────────────────────────────────────────────────
// Command handlers
// ──────────────────────────────────────────────────────────
/** Switch GitHub Account */
async function cmdSwitch() {
    let remoteInfo;
    try {
        remoteInfo = await accountManager.getCurrentRemoteInfo();
    }
    catch (err) {
        vscode.window.showErrorMessage(`Failed to read repository info: ${err.message}`);
        return;
    }
    if (!remoteInfo) {
        vscode.window.showWarningMessage('No git repository or remote URL was found in the current workspace.');
        return;
    }
    if (!remoteInfo.isSSH) {
        vscode.window.showWarningMessage('The current remote uses HTTPS. Convert it to SSH before switching accounts.', { modal: false });
        return;
    }
    const current = await accountManager.getCurrentAccount();
    const selected = await (0, quickPick_1.showAccountSwitcher)(accountManager, current);
    if (!selected) {
        return; // User cancelled or chose the same account.
    }
    statusBar.setLoading();
    try {
        await accountManager.switchAccount(selected);
        await refreshStatusBar();
        vscode.window.showInformationMessage(`Switched to GitHub account: ${selected.name}`);
    }
    catch (err) {
        await refreshStatusBar();
        vscode.window.showErrorMessage(`Failed to switch account: ${err.message}`);
    }
}
/** Add New Account */
async function cmdAdd() {
    const account = await accountManager.addAccountInteractive();
    if (account) {
        vscode.window.showInformationMessage(`Account "${account.name}" added successfully.`);
        await refreshStatusBar();
    }
}
/** Test Current Connection */
async function cmdTestCurrent() {
    const remoteInfo = await accountManager.getCurrentRemoteInfo();
    if (!remoteInfo?.hostAlias) {
        vscode.window.showWarningMessage('Could not determine the current SSH host alias. ' +
            'Make sure the repository has an SSH remote URL.');
        return;
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Testing SSH connection to ${remoteInfo.hostAlias}…`,
        cancellable: false,
    }, async () => {
        const result = await (0, gitCommands_1.testSshConnection)(remoteInfo.hostAlias);
        if (result.success) {
            vscode.window.showInformationMessage(`SSH connection successful!\n${result.output}`);
        }
        else {
            const action = await vscode.window.showErrorMessage(`SSH connection failed for "${remoteInfo.hostAlias}".\n${result.output}`, 'Switch Account');
            if (action === 'Switch Account') {
                await cmdSwitch();
            }
        }
    });
}
/** Edit SSH Config */
async function cmdEditSshConfig() {
    const uri = vscode.Uri.file(sshConfigParser_1.SSH_CONFIG_PATH);
    try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
    }
    catch {
        const action = await vscode.window.showInformationMessage(`No SSH config found at "${sshConfigParser_1.SSH_CONFIG_PATH}". Create it now?`, 'Create');
        if (action !== 'Create') {
            return;
        }
        const startContent = '# ~/.ssh/config – GitHub SSH host aliases\n' +
            '#\n' +
            '# Example:\n' +
            '#\n' +
            '# Host github.com-agency\n' +
            '#     HostName github.com\n' +
            '#     User git\n' +
            '#     IdentityFile ~/.ssh/id_ed25519_agency\n' +
            '#     IdentitiesOnly yes\n\n';
        const doc = await vscode.workspace.openTextDocument({
            content: startContent,
            language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc);
    }
}
/** Sync Git Config */
async function cmdSyncGitConfig() {
    const current = await accountManager.getCurrentAccount();
    if (!current) {
        vscode.window.showWarningMessage('No account was detected for the current repository. ' +
            'Switch to an account first.');
        return;
    }
    if (!current.email && !current.username) {
        vscode.window.showWarningMessage(`Account "${current.name}" has no email or username configured. ` +
            'Edit the account in Settings → GitHub Account Switcher → Accounts.');
        return;
    }
    try {
        await accountManager.syncGitConfig(current);
        const parts = [];
        if (current.username) {
            parts.push(`user.name = "${current.username}"`);
        }
        if (current.email) {
            parts.push(`user.email = "${current.email}"`);
        }
        vscode.window.showInformationMessage(`Git config synced for "${current.name}": ${parts.join(', ')}`);
    }
    catch (err) {
        vscode.window.showErrorMessage(`Failed to sync git config: ${err.message}`);
    }
}
//# sourceMappingURL=extension.js.map