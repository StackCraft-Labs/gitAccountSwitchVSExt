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
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Owns the status-bar item that shows the currently active GitHub account.
 * Clicking it triggers the Switch command.
 */
class StatusBarManager {
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 
        // Priority: high enough to appear near other SCM items.
        100);
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
    showAccount(account) {
        this.item.text = `$(account) GH: ${account.name}`;
        this.item.tooltip = new vscode.MarkdownString([
            `**GitHub Account Switcher**`,
            ``,
            `Account  : ${account.name}`,
            `Alias    : \`${account.hostAlias}\``,
            account.email ? `Email    : ${account.email}` : null,
            account.username ? `Username : ${account.username}` : null,
            ``,
            `_Click to switch account_`,
        ]
            .filter(l => l !== null)
            .join('\n'));
        this.item.backgroundColor = undefined;
        this.item.show();
    }
    /** SSH remote detected but no matching account configured. */
    showUnknown(hostAlias) {
        this.item.text = `$(question) GH: Unknown`;
        this.item.tooltip =
            `Remote uses host alias "${hostAlias}" but no matching account is configured.\n` +
                `Click to add or switch account.`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.item.show();
    }
    /** Remote uses HTTPS – switching not applicable. */
    showHttps() {
        this.item.text = `$(lock) GH: HTTPS`;
        this.item.tooltip =
            'Remote uses HTTPS. Convert to SSH to enable account switching.\n' +
                'Click to open the account switcher anyway.';
        this.item.backgroundColor = undefined;
        this.item.show();
    }
    /** No git repository or no remote configured in the open workspace. */
    showNoRepo() {
        this.item.text = `$(source-control) GH: No repo`;
        this.item.tooltip =
            'No git repository or remote URL found in the current workspace.\n' +
                'Open a folder that contains a .git directory.';
        this.item.backgroundColor = undefined;
        this.item.show();
    }
    /** Show a spinner while async work is in progress. */
    setLoading() {
        this.item.text = `$(sync~spin) GH: …`;
        this.item.tooltip = 'Detecting GitHub account…';
        this.item.backgroundColor = undefined;
        this.item.show();
    }
    /** @deprecated Use the specific show* methods instead. */
    show(account, isSSH) {
        if (!isSSH) {
            this.showHttps();
            return;
        }
        if (account) {
            this.showAccount(account);
        }
        else {
            this.showUnknown('?');
        }
    }
    /** Hide the item entirely (only called on dispose). */
    hide() {
        this.item.hide();
    }
    dispose() {
        this.item.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBar.js.map