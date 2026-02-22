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
exports.showAccountSwitcher = showAccountSwitcher;
exports.confirm = confirm;
const vscode = __importStar(require("vscode"));
// Sentinel object used for the "Add New Account…" option.
const ADD_NEW_SENTINEL = Symbol('ADD_NEW');
// ──────────────────────────────────────────────────────────
// Public
// ──────────────────────────────────────────────────────────
/**
 * Show a quick-pick listing all known accounts.  Returns:
 *  - The selected Account on a successful pick.
 *  - The result of addAccountInteractive() when the user chooses "Add New".
 *  - null when the user cancels or there is nothing to do.
 */
async function showAccountSwitcher(accountManager, currentAccount) {
    const accounts = await accountManager.getAllAccounts();
    if (accounts.length === 0) {
        const action = await vscode.window.showInformationMessage('No GitHub accounts are configured yet.  Add one now?', { modal: false }, 'Add Account');
        if (action === 'Add Account') {
            return accountManager.addAccountInteractive();
        }
        return null;
    }
    const accountItems = accounts.map(account => {
        const isActive = currentAccount?.hostAlias === account.hostAlias;
        const details = [];
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
    const separator = {
        label: '',
        kind: vscode.QuickPickItemKind.Separator,
    };
    const addNewItem = {
        label: '$(add)  Add New Account…',
        description: '',
        detail: 'Configure a new GitHub SSH account and optionally update ~/.ssh/config',
        _sentinel: ADD_NEW_SENTINEL,
    };
    const allItems = [
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
    const chosen = picked.account;
    // Same account chosen – nothing to do.
    if (chosen.hostAlias === currentAccount?.hostAlias) {
        vscode.window.showInformationMessage(`Already using account "${chosen.name}".`);
        return null;
    }
    return chosen;
}
/**
 * Show a simple yes/no confirmation dialog.
 * Returns true when the user clicks "Yes".
 */
async function confirm(message, yesLabel = 'Yes', detail) {
    const choice = await vscode.window.showWarningMessage(message, { modal: true, detail }, yesLabel, 'No');
    return choice === yesLabel;
}
//# sourceMappingURL=quickPick.js.map