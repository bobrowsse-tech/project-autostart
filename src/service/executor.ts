import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import treeKill from 'tree-kill';
import type { Runbook, RunbookService, StartResult, StopResult, TrackedProcess } from './types';
import { isPortInUse, waitForHealth } from './health';

export type LogFn = (serviceId: string, line: string) => void;
export type StatusFn = (serviceId: string, status: string, detail?: string) => void;

export interface ExecutorState {
  processes: TrackedProcess[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  return new Promise((resolve) => {
    treeKill(pid, signal, () => resolve());
  });
}

async function stopPid(pid: number, log: LogFn, serviceId: string): Promise<void> {
  log(serviceId, `Sending SIGTERM to pid ${pid}`);
  await killTree(pid, 'SIGTERM');
  await sleep(5000);
  try {
    process.kill(pid, 0);
    log(serviceId, `Grace period elapsed — SIGKILL pid ${pid}`);
    await killTree(pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

function spawnService(
  root: string,
  svc: RunbookService,
  log: LogFn
): { child: ChildProcess; tracked: TrackedProcess } {
  const cwd = path.resolve(root, svc.cwd || '.');
  const child = spawn(svc.command, {
    cwd,
    shell: true,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const onData = (buf: Buffer) => {
    const text = buf.toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (line.length) {
        log(svc.id, line);
      }
    }
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);

  return {
    child,
    tracked: {
      serviceId: svc.id,
      pid: child.pid,
      startedAt: new Date().toISOString(),
      composeProject: svc.kind === 'compose' ? svc.composeService : undefined,
    },
  };
}

/**
 * Start services in runbook order with health-check gating.
 * Pure Node — logging/status via callbacks; PID list returned for persistence.
 */
export async function startRunbook(
  root: string,
  runbook: Runbook,
  previous: TrackedProcess[],
  log: LogFn,
  onStatus: StatusFn
): Promise<{ result: StartResult; processes: TrackedProcess[] }> {
  const processes = [...previous];
  const started: string[] = [];

  for (const svc of runbook.services) {
    onStatus(svc.id, 'starting');

    // Detect ports already in use before start.
    for (const port of extractPorts(svc)) {
      if (await isPortInUse(port)) {
        const reason = `Port ${port} is already in use before starting ${svc.id}. Stop the stale process or edit the runbook.`;
        onStatus(svc.id, 'failed', reason);
        log(svc.id, reason);
        return {
          result: { started, failed: { serviceId: svc.id, reason } },
          processes,
        };
      }
    }

    log(svc.id, `$ ${svc.command}`);
    const { tracked } = spawnService(root, svc, log);
    processes.push(tracked);

    const health = await waitForHealth(svc.healthCheck, {
      onTick: (msg) => log(svc.id, msg),
    });
    if (!health.ok) {
      const reason = `Service "${svc.id}" did not become healthy: ${health.detail}`;
      onStatus(svc.id, 'failed', reason);
      log(svc.id, reason);
      if (tracked.pid) {
        await stopPid(tracked.pid, log, svc.id);
      }
      return {
        result: { started, failed: { serviceId: svc.id, reason } },
        processes: processes.filter((p) => p.serviceId !== svc.id),
      };
    }

    onStatus(svc.id, 'healthy', health.detail);
    log(svc.id, `Healthy (${health.detail})`);
    started.push(svc.id);
  }

  return { result: { started }, processes };
}

function extractPorts(svc: RunbookService): number[] {
  const hc = svc.healthCheck;
  if (!hc) {
    return [];
  }
  if (hc.type === 'tcp') {
    const port = Number(hc.target.split(':').pop());
    return Number.isFinite(port) ? [port] : [];
  }
  if (hc.type === 'http') {
    try {
      const u = new URL(hc.target);
      const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
      return Number.isFinite(port) ? [port] : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Stop tracked processes in reverse start order.
 */
export async function stopRunbook(
  root: string,
  runbook: Runbook | undefined,
  processes: TrackedProcess[],
  log: LogFn,
  onStatus: StatusFn
): Promise<{ result: StopResult; processes: TrackedProcess[] }> {
  const order = runbook
    ? [...runbook.services].map((s) => s.id).reverse()
    : [...new Set(processes.map((p) => p.serviceId))].reverse();

  const stopped: string[] = [];
  const remaining = [...processes];

  for (const id of order) {
    const tracked = remaining.filter((p) => p.serviceId === id);
    if (!tracked.length) {
      continue;
    }
    onStatus(id, 'stopping');
    for (const t of tracked) {
      if (t.composeProject) {
        log(id, 'docker compose down (service teardown)');
        await new Promise<void>((resolve) => {
          const child = spawn('docker compose down', {
            cwd: root,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      } else if (t.pid) {
        await stopPid(t.pid, log, id);
      }
    }
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (remaining[i].serviceId === id) {
        remaining.splice(i, 1);
      }
    }
    onStatus(id, 'stopped');
    stopped.push(id);
  }

  return { result: { stopped }, processes: remaining };
}
