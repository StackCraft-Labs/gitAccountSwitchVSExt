import * as vscode from 'vscode';
import { Account } from './types';

/**
 * Owns the status-bar item that shows the currently active GitHub account.
 * Clicking it triggers the Switch command.
 */
export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      // Priority: high enough to appear near other SCM items.
      100
    );
    this.item.command = 'github-account.switch';
  }

  // ── Public API ─────────────────────────────────────────

  /**
   * Update the status bar to reflect the current state.
   *
   * @param account  The detected account, or null when detection failed.
   * @param isSSH    Whether the current remote URL uses SSH.
   */
  /** Active SSH account detected. */
  public showAccount(account: Account): void {
    this.item.text = `$(account) GH: ${account.name}`;
    this.item.tooltip = new vscode.MarkdownString(
      [
        `**GitHub Account Switcher**`,
        ``,
        `Account  : ${account.name}`,
        `Alias    : \`${account.hostAlias}\``,
        account.email    ? `Email    : ${account.email}`    : null,
        account.username ? `Username : ${account.username}` : null,
        ``,
        `_Click to switch account_`,
      ]
        .filter(l => l !== null)
        .join('\n')
    );
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  /** SSH remote detected but no matching account configured. */
  public showUnknown(hostAlias: string): void {
    this.item.text = `$(question) GH: Unknown`;
    this.item.tooltip =
      `Remote uses host alias "${hostAlias}" but no matching account is configured.\n` +
      `Click to add or switch account.`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.show();
  }

  /** Remote uses HTTPS – switching not applicable. */
  public showHttps(): void {
    this.item.text = `$(lock) GH: HTTPS`;
    this.item.tooltip =
      'Remote uses HTTPS. Convert to SSH to enable account switching.\n' +
      'Click to open the account switcher anyway.';
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  /** No git repository or no remote configured in the open workspace. */
  public showNoRepo(): void {
    this.item.text = `$(source-control) GH: No repo`;
    this.item.tooltip =
      'No git repository or remote URL found in the current workspace.\n' +
      'Open a folder that contains a .git directory.';
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  /** Show a spinner while async work is in progress. */
  public setLoading(): void {
    this.item.text = `$(sync~spin) GH: …`;
    this.item.tooltip = 'Detecting GitHub account…';
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  /** @deprecated Use the specific show* methods instead. */
  public show(account: Account | null, isSSH: boolean): void {
    if (!isSSH) { this.showHttps(); return; }
    if (account) { this.showAccount(account); } else { this.showUnknown('?'); }
  }

  /** Hide the item entirely (only called on dispose). */
  public hide(): void {
    this.item.hide();
  }

  public dispose(): void {
    this.item.dispose();
  }
}
