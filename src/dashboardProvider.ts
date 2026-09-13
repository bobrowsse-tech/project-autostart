import * as vscode from 'vscode';
import type { ScanResult, ServiceRuntimeStatus } from './service';

const BUTTONS: { label: string; command: string }[] = [
  { label: 'Scan & Generate Plan', command: 'projectAutostart.scan' },
  { label: 'Start Project', command: 'projectAutostart.start' },
  { label: 'Stop Project', command: 'projectAutostart.stop' },
  { label: 'View Logs', command: 'projectAutostart.viewLogs' },
  { label: 'Edit Runbook', command: 'projectAutostart.editRunbook' },
];

interface ServiceRow {
  id: string;
  status: ServiceRuntimeStatus | string;
  detail?: string;
}

export class DashboardProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private summary = 'No scan run yet.';
  private services: ServiceRow[] = [];
  private logLines: string[] = [];

  constructor() {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === 'runCommand') {
        void vscode.commands.executeCommand(message.command);
      }
    });
  }

  setSummary(text: string) {
    this.summary = text;
    this.post({ type: 'summary', text });
  }

  setServiceStatus(id: string, status: string, detail?: string) {
    const existing = this.services.find((s) => s.id === id);
    if (existing) {
      existing.status = status;
      existing.detail = detail;
    } else {
      this.services.push({ id, status, detail });
    }
    this.post({ type: 'services', services: this.services });
  }

  showScanResult(result: ScanResult) {
    this.services = result.runbook.services.map((s) => ({
      id: s.id,
      status: 'idle' as const,
      detail: s.command,
    }));
    this.post({ type: 'services', services: this.services });
    if (result.runbook.warnings.length) {
      for (const w of result.runbook.warnings) {
        this.appendLog('scan', w);
      }
    }
  }

  appendLog(serviceId: string, line: string) {
    const entry = `[${serviceId}] ${line}`;
    this.logLines.push(entry);
    if (this.logLines.length > 200) {
      this.logLines = this.logLines.slice(-200);
    }
    this.post({ type: 'log', line: entry });
  }

  private post(message: unknown) {
    void this.view?.webview.postMessage(message);
  }

  private getHtml(): string {
    const buttonsHtml = BUTTONS.map(
      (b) => `<button data-command="${b.command}">${b.label}</button>`
    ).join('\n');

    const nonce = String(Date.now());

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 8px;
      font-size: var(--vscode-font-size);
    }
    button {
      display: block; width: 100%; margin-bottom: 6px; padding: 6px 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; cursor: pointer; text-align: left;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    #summary {
      margin: 8px 0 12px;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .svc {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 4px; font-size: 0.85em;
    }
    .pill {
      display: inline-block; padding: 1px 8px; border-radius: 10px;
      font-size: 0.75em; text-transform: uppercase;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .pill.healthy { outline: 1px solid var(--vscode-testing-iconPassed); }
    .pill.failed { outline: 1px solid var(--vscode-testing-iconFailed); }
    .pill.starting, .pill.stopping { outline: 1px solid var(--vscode-testing-iconQueued); }
    #logs {
      margin-top: 12px; max-height: 180px; overflow: auto;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, transparent);
      padding: 6px; font-family: var(--vscode-editor-font-family);
      font-size: 0.75em; white-space: pre-wrap;
    }
    h3 { margin: 12px 0 6px; font-size: 0.9em; font-weight: 600; }
  </style>
</head>
<body>
  <div id="summary">${escapeHtml(this.summary)}</div>
  ${buttonsHtml}
  <h3>Services</h3>
  <div id="services"></div>
  <h3>Logs</h3>
  <div id="logs"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const servicesEl = document.getElementById('services');
    const logsEl = document.getElementById('logs');
    const summaryEl = document.getElementById('summary');

    document.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runCommand', command: btn.dataset.command });
      });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'summary') {
        summaryEl.textContent = msg.text;
      } else if (msg.type === 'services') {
        servicesEl.innerHTML = '';
        for (const s of msg.services) {
          const row = document.createElement('div');
          row.className = 'svc';
          const pill = document.createElement('span');
          pill.className = 'pill ' + (s.status || '');
          pill.textContent = s.status || 'idle';
          const label = document.createElement('span');
          label.textContent = s.id + (s.detail ? ' — ' + s.detail : '');
          row.appendChild(pill);
          row.appendChild(label);
          servicesEl.appendChild(row);
        }
      } else if (msg.type === 'log') {
        logsEl.textContent += msg.line + '\\n';
        logsEl.scrollTop = logsEl.scrollHeight;
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
