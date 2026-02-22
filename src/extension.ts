import * as vscode from 'vscode';
import { AccountManager } from './accountManager';
import { StatusBarManager } from './statusBar';
import { showAccountSwitcher } from './quickPick';
import { SSH_CONFIG_PATH } from './sshConfigParser';
import { testSshConnection } from './gitCommands';

// ──────────────────────────────────────────────────────────
// Extension-level singletons
// ──────────────────────────────────────────────────────────

let accountManager: AccountManager;
let statusBar: StatusBarManager;

// ──────────────────────────────────────────────────────────
// Activation
// ──────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  accountManager = new AccountManager();
  statusBar = new StatusBarManager();

  // Register all commands.
  context.subscriptions.push(
    vscode.commands.registerCommand('github-account.switch', cmdSwitch),
    vscode.commands.registerCommand('github-account.add', cmdAdd),
    vscode.commands.registerCommand('github-account.testCurrent', cmdTestCurrent),
    vscode.commands.registerCommand('github-account.editSshConfig', cmdEditSshConfig),
    vscode.commands.registerCommand('github-account.syncGitConfig', cmdSyncGitConfig)
  );

  // Keep the status bar in sync when the workspace or settings change.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      accountManager.updateRepoRoot();
      void refreshStatusBar();
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('githubAccountSwitcher')) {
        void refreshStatusBar();
      }
    })
  );

  // Register the status bar item for disposal on deactivation.
  context.subscriptions.push(statusBar);

  // Initial refresh.
  void refreshStatusBar();
}

// ──────────────────────────────────────────────────────────
// Deactivation
// ──────────────────────────────────────────────────────────

export function deactivate(): void {
  // Resources are cleaned up via context.subscriptions.
}

// ──────────────────────────────────────────────────────────
// Status bar refresh
// ──────────────────────────────────────────────────────────

async function refreshStatusBar(): Promise<void> {
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
    } else {
      statusBar.showUnknown(remoteInfo.hostAlias ?? '?');
    }
  } catch {
    // Even on error, keep the item visible so the user can click to retry.
    statusBar.showNoRepo();
  }
}

// ──────────────────────────────────────────────────────────
// Command handlers
// ──────────────────────────────────────────────────────────

/** Switch GitHub Account */
async function cmdSwitch(): Promise<void> {
  let remoteInfo;
  try {
    remoteInfo = await accountManager.getCurrentRemoteInfo();
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to read repository info: ${err.message}`);
    return;
  }

  if (!remoteInfo) {
    vscode.window.showWarningMessage(
      'No git repository or remote URL was found in the current workspace.'
    );
    return;
  }

  if (!remoteInfo.isSSH) {
    vscode.window.showWarningMessage(
      'The current remote uses HTTPS. Convert it to SSH before switching accounts.',
      { modal: false }
    );
    return;
  }

  const current = await accountManager.getCurrentAccount();
  const selected = await showAccountSwitcher(accountManager, current);

  if (!selected) {
    return; // User cancelled or chose the same account.
  }

  statusBar.setLoading();

  try {
    await accountManager.switchAccount(selected);
    await refreshStatusBar();
    vscode.window.showInformationMessage(
      `Switched to GitHub account: ${selected.name}`
    );
  } catch (err: any) {
    await refreshStatusBar();
    vscode.window.showErrorMessage(`Failed to switch account: ${err.message}`);
  }
}

/** Add New Account */
async function cmdAdd(): Promise<void> {
  const account = await accountManager.addAccountInteractive();
  if (account) {
    vscode.window.showInformationMessage(
      `Account "${account.name}" added successfully.`
    );
    await refreshStatusBar();
  }
}

/** Test Current Connection */
async function cmdTestCurrent(): Promise<void> {
  const remoteInfo = await accountManager.getCurrentRemoteInfo();

  if (!remoteInfo?.hostAlias) {
    vscode.window.showWarningMessage(
      'Could not determine the current SSH host alias. ' +
      'Make sure the repository has an SSH remote URL.'
    );
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Testing SSH connection to ${remoteInfo.hostAlias}…`,
      cancellable: false,
    },
    async () => {
      const result = await testSshConnection(remoteInfo.hostAlias!);

      if (result.success) {
        vscode.window.showInformationMessage(
          `SSH connection successful!\n${result.output}`
        );
      } else {
        const action = await vscode.window.showErrorMessage(
          `SSH connection failed for "${remoteInfo.hostAlias}".\n${result.output}`,
          'Switch Account'
        );
        if (action === 'Switch Account') {
          await cmdSwitch();
        }
      }
    }
  );
}

/** Edit SSH Config */
async function cmdEditSshConfig(): Promise<void> {
  const uri = vscode.Uri.file(SSH_CONFIG_PATH);

  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  } catch {
    const action = await vscode.window.showInformationMessage(
      `No SSH config found at "${SSH_CONFIG_PATH}". Create it now?`,
      'Create'
    );
    if (action !== 'Create') {
      return;
    }

    const startContent =
      '# ~/.ssh/config – GitHub SSH host aliases\n' +
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
async function cmdSyncGitConfig(): Promise<void> {
  const current = await accountManager.getCurrentAccount();

  if (!current) {
    vscode.window.showWarningMessage(
      'No account was detected for the current repository. ' +
      'Switch to an account first.'
    );
    return;
  }

  if (!current.email && !current.username) {
    vscode.window.showWarningMessage(
      `Account "${current.name}" has no email or username configured. ` +
      'Edit the account in Settings → GitHub Account Switcher → Accounts.'
    );
    return;
  }

  try {
    await accountManager.syncGitConfig(current);
    const parts: string[] = [];
    if (current.username) {
      parts.push(`user.name = "${current.username}"`);
    }
    if (current.email) {
      parts.push(`user.email = "${current.email}"`);
    }
    vscode.window.showInformationMessage(
      `Git config synced for "${current.name}": ${parts.join(', ')}`
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to sync git config: ${err.message}`);
  }
}
