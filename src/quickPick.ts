import * as vscode from 'vscode';
import { Account } from './types';
import { AccountManager } from './accountManager';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

type AccountItem = vscode.QuickPickItem & { account: Account };

// Sentinel object used for the "Add New Account…" option.
const ADD_NEW_SENTINEL = Symbol('ADD_NEW');
type AddNewItem = vscode.QuickPickItem & { _sentinel: typeof ADD_NEW_SENTINEL };

// ──────────────────────────────────────────────────────────
// Public
// ──────────────────────────────────────────────────────────

/**
 * Show a quick-pick listing all known accounts.  Returns:
 *  - The selected Account on a successful pick.
 *  - The result of addAccountInteractive() when the user chooses "Add New".
 *  - null when the user cancels or there is nothing to do.
 */
export async function showAccountSwitcher(
  accountManager: AccountManager,
  currentAccount: Account | null
): Promise<Account | null> {
  const accounts = await accountManager.getAllAccounts();

  if (accounts.length === 0) {
    const action = await vscode.window.showInformationMessage(
      'No GitHub accounts are configured yet.  Add one now?',
      { modal: false },
      'Add Account'
    );
    if (action === 'Add Account') {
      return accountManager.addAccountInteractive();
    }
    return null;
  }

  const accountItems: AccountItem[] = accounts.map(account => {
    const isActive = currentAccount?.hostAlias === account.hostAlias;
    const details: string[] = [];
    if (account.email) {
      details.push(`email: ${account.email}`);
    }
    if (account.keyPath) {
      details.push(`key: ${account.keyPath}`);
    }

    return {
      label: `${isActive ? '$(check) ' : '$(account) '}${account.name}`,
      description: account.hostAlias,
      detail: details.join('   '),
      account,
    };
  });

  const separator: vscode.QuickPickItem = {
    label: '',
    kind: vscode.QuickPickItemKind.Separator,
  };

  const addNewItem: AddNewItem = {
    label: '$(add)  Add New Account…',
    description: '',
    detail: 'Configure a new GitHub SSH account and optionally update ~/.ssh/config',
    _sentinel: ADD_NEW_SENTINEL,
  };

  const allItems: vscode.QuickPickItem[] = [
    ...accountItems,
    separator,
    addNewItem,
  ];

  const picked = await vscode.window.showQuickPick(allItems, {
    title: 'GitHub Account Switcher',
    placeHolder: currentAccount
      ? `Current: ${currentAccount.name}  ·  Select an account to switch`
      : 'Select a GitHub account',
    matchOnDescription: true,
    matchOnDetail: false,
  });

  if (!picked) {
    return null; // Dismissed.
  }

  // "Add New Account…" was selected.
  if ('_sentinel' in picked) {
    return accountManager.addAccountInteractive();
  }

  const chosen = (picked as AccountItem).account;

  // Same account chosen – nothing to do.
  if (chosen.hostAlias === currentAccount?.hostAlias) {
    vscode.window.showInformationMessage(
      `Already using account "${chosen.name}".`
    );
    return null;
  }

  return chosen;
}

/**
 * Show a simple yes/no confirmation dialog.
 * Returns true when the user clicks "Yes".
 */
export async function confirm(
  message: string,
  yesLabel = 'Yes',
  detail?: string
): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    message,
    { modal: true, detail },
    yesLabel,
    'No'
  );
  return choice === yesLabel;
}
