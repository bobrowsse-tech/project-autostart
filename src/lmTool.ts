import * as vscode from 'vscode';

// Language Model Tool registration — makes this extension's core capability
// callable by Copilot Chat, Claude Code, or any other agent that supports
// VS Code's Language Model Tool API. The `name` here MUST match the `name`
// field of the languageModelTools entry in package.json.
//
// Docs: https://code.visualstudio.com/api/extension-guides/ai/tools

export function registerProjectAutostartRunTool(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.lm.registerTool("project_autostart_run", {
      async invoke(
        options: vscode.LanguageModelToolInvocationOptions<any>,
        _token: vscode.CancellationToken
      ) {
        // TODO: implement using the same core logic the dashboard buttons
        // call — do not duplicate; both entry points should call one
        // shared service module (see DIRECTIVE.md, "Implementation phases").
        const result = "project_autostart_run is not yet implemented \u2014 see DIRECTIVE.md";
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(result),
        ]);
      },
    })
  );
}
