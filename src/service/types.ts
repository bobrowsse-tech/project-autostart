export type ServiceKind =
  | 'npm'
  | 'python'
  | 'compose'
  | 'procfile'
  | 'makefile';

export type HealthCheckType = 'tcp' | 'http' | 'grace';

export interface HealthCheck {
  type: HealthCheckType;
  /** Host:port for tcp, URL for http, milliseconds for grace. */
  target: string;
}

export interface ServiceCandidate {
  id: string;
  kind: ServiceKind;
  command: string;
  cwd: string;
  ports: number[];
  dependsOn: string[];
  healthCheck?: HealthCheck;
  /** Compose service name when kind === 'compose'. */
  composeService?: string;
  envHints?: Record<string, string>;
}

export type FieldSource = 'inferred' | 'manual';

export interface RunbookService {
  id: string;
  command: string;
  cwd: string;
  healthCheck?: HealthCheck;
  dependsOn: string[];
  kind: ServiceKind;
  composeService?: string;
  /** Per-field provenance so re-scans do not clobber manual edits. */
  fieldSources?: Partial<Record<'command' | 'cwd' | 'healthCheck' | 'dependsOn', FieldSource>>;
}

export interface Runbook {
  version: 1;
  generatedAt: string;
  services: RunbookService[];
  warnings: string[];
}

export type ServiceRuntimeStatus =
  | 'idle'
  | 'starting'
  | 'healthy'
  | 'failed'
  | 'stopping'
  | 'stopped';

export interface TrackedProcess {
  serviceId: string;
  pid?: number;
  composeProject?: string;
  startedAt: string;
}

export interface ScanResult {
  runbook: Runbook;
  candidates: ServiceCandidate[];
  wrotePath: string;
  overwritten: boolean;
}

export interface StartResult {
  started: string[];
  failed?: { serviceId: string; reason: string };
}

export interface StopResult {
  stopped: string[];
}

export interface StatusSnapshot {
  services: Array<{
    id: string;
    status: ServiceRuntimeStatus;
    pid?: number;
  }>;
  lastScanAt?: string;
}
