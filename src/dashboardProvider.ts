import * as vscode from 'vscode';

// Dashboard button spec — kept in sync with DIRECTIVE.md and package.json's
// contributes.commands. Each entry becomes a button in the sidebar webview;
// clicking it posts a message the extension host handles by running the
// matching command.
const BUTTONS: { label: string; command: string }[] = [
{ label: "Scan & Generate Plan", command: "projectAutostart.scan" },
{ label: "Start Project", command: "projectAutostart.start" },
{ label: "Stop Project", command: "projectAutostart.stop" },
{ label: "View Logs", command: "projectAutostart.viewLogs" },
{ label: "Edit Runbook", command: "projectAutostart.editRunbook" }
];

export class DashboardProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === 'runCommand') {
        vscode.commands.executeCommand(message.command);
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const buttonsHtml = BUTTONS.map(
      (b) => `<button data-command="${b.command}">${b.label}</button>`
    ).join('\n');

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: var(--vscode-font-family); padding: 8px; }
          button {
            display: block; width: 100%; margin-bottom: 6px; padding: 6px 10px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none; border-radius: 4px; cursor: pointer; text-align: left;
          }
          button:hover { background: var(--vscode-button-hoverBackground); }
          #status { margin-top: 12px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
        </style>
      </head>
      <body>
        ${buttonsHtml}
        <div id="status">No scan run yet.</div>
        <script>
          const vscode = acquireVsCodeApi();
          document.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
              vscode.postMessage({ type: 'runCommand', command: btn.dataset.command });
            });
          });
        </script>
      </body>
      </html>`;
  }
}
