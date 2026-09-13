import * as vscode from 'vscode';
import { DashboardProvider } from './dashboardProvider';
import { registerProjectAutostartRunTool } from './lmTool';

export function activate(context: vscode.ExtensionContext) {
  const dashboard = new DashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("project-autostartView", dashboard)
  );

  context.subscriptions.push(vscode.commands.registerCommand("projectAutostart.scan", () => {
    // TODO (Scan & Generate Plan): Fingerprints the repo, builds the dependency graph, writes/updates .runbook.json, and renders the plan in the dashboard for review before anything runs.
    vscode.window.showInformationMessage("Scan & Generate Plan \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("projectAutostart.start", () => {
    // TODO (Start Project): Executes the runbook step by step, polling each service's declared health check (port open / HTTP 200) before starting the next, streaming output into a dedicated output channel.
    vscode.window.showInformationMessage("Start Project \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("projectAutostart.stop", () => {
    // TODO (Stop Project): Tears down every process/container the runbook started, using tracked PIDs (tree-kill) or `docker compose down`, in reverse start order.
    vscode.window.showInformationMessage("Stop Project \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("projectAutostart.viewLogs", () => {
    // TODO (View Logs): Opens the output channel showing interleaved, color-coded logs per service for the current run.
    vscode.window.showInformationMessage("View Logs \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("projectAutostart.editRunbook", () => {
    // TODO (Edit Runbook): Opens .runbook.json for manual correction when the inferred plan gets a command or health check wrong.
    vscode.window.showInformationMessage("Edit Runbook \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  // Exposes the same capability to Copilot Chat / Claude Code / any MCP-aware
  // agent via the Language Model Tool API — see contributes.languageModelTools
  // in package.json and DIRECTIVE.md, section "Language Model Tool".
  registerProjectAutostartRunTool(context);
}

export function deactivate() {}
