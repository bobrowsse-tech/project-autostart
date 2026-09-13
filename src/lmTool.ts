import * as vscode from 'vscode';
import type { AutostartService } from './service';
import type { DashboardProvider } from './dashboardProvider';

type Action = 'scan' | 'start' | 'stop' | 'status';

interface ToolInput {
  action: Action;
}

type LogFn = (serviceId: string, line: string) => void;
type StatusFn = (serviceId: string, status: string, detail?: string) => void;

/**
 * Language Model Tool — same AutostartService as the dashboard commands.
 * start/stop are allowed here per DIRECTIVE.md (this extension's LM surface).
 */
export function registerProjectAutostartRunTool(
  context: vscode.ExtensionContext,
  getService: () => AutostartService | undefined,
  log: LogFn,
  onStatus: StatusFn,
  dashboard: DashboardProvider
) {
  context.subscriptions.push(
    vscode.lm.registerTool('project_autostart_run', {
      async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ToolInput>,
        _token: vscode.CancellationToken
      ) {
        const service = getService();
        if (!service) {
          return textResult('No workspace folder is open.');
        }

        const action = options.input?.action;
        switch (action) {
          case 'scan': {
            const result = service.scan();
            dashboard.showScanResult(result);
            dashboard.setSummary(service.formatScanReport(result).split('\n')[0]);
            return textResult(service.formatScanReport(result));
          }
          case 'start': {
            const result = await service.start(log, onStatus);
            if (result.failed) {
              return textResult(
                `Start failed at ${result.failed.serviceId}: ${result.failed.reason}`
              );
            }
            return textResult(
              result.started.length
                ? `Started: ${result.started.join(', ')}`
                : 'Nothing to start.'
            );
          }
          case 'stop': {
            const result = await service.stop(log, onStatus);
            return textResult(
              result.stopped.length
                ? `Stopped: ${result.stopped.join(', ')}`
                : 'Nothing was running.'
            );
          }
          case 'status': {
            return textResult(service.formatStatusReport(service.status()));
          }
          default:
            return textResult(
              `Unknown action "${String(action)}". Use scan, start, stop, or status.`
            );
        }
      },
    })
  );
}

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
