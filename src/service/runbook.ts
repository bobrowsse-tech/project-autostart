import * as fs from 'fs';
import * as path from 'path';
import type { Runbook, RunbookService, ServiceCandidate } from './types';
import { orderServices } from './order';

export const RUNBOOK_FILENAME = '.runbook.json';

export function runbookPath(root: string): string {
  return path.join(root, RUNBOOK_FILENAME);
}

function candidateToRunbookService(c: ServiceCandidate): RunbookService {
  return {
    id: c.id,
    command: c.command,
    cwd: c.cwd,
    healthCheck: c.healthCheck,
    dependsOn: c.dependsOn,
    kind: c.kind,
    composeService: c.composeService,
    fieldSources: {
      command: 'inferred',
      cwd: 'inferred',
      healthCheck: 'inferred',
      dependsOn: 'inferred',
    },
  };
}

/**
 * Merge a freshly inferred plan with an existing runbook, preserving fields
 * marked `manual`.
 */
export function mergeRunbook(existing: Runbook | undefined, inferred: Runbook): Runbook {
  if (!existing) {
    return inferred;
  }
  const existingById = new Map(existing.services.map((s) => [s.id, s]));
  const mergedServices: RunbookService[] = inferred.services.map((inf) => {
    const prev = existingById.get(inf.id);
    if (!prev) {
      return inf;
    }
    const sources = { ...inf.fieldSources, ...prev.fieldSources };
    return {
      ...inf,
      command: sources.command === 'manual' ? prev.command : inf.command,
      cwd: sources.cwd === 'manual' ? prev.cwd : inf.cwd,
      healthCheck: sources.healthCheck === 'manual' ? prev.healthCheck : inf.healthCheck,
      dependsOn: sources.dependsOn === 'manual' ? prev.dependsOn : inf.dependsOn,
      fieldSources: sources,
      kind: prev.kind ?? inf.kind,
      composeService: prev.composeService ?? inf.composeService,
    };
  });

  // Keep manually-added services that inference no longer sees.
  for (const prev of existing.services) {
    if (!mergedServices.some((s) => s.id === prev.id)) {
      const manual =
        prev.fieldSources?.command === 'manual' ||
        prev.fieldSources?.cwd === 'manual' ||
        prev.fieldSources?.healthCheck === 'manual';
      if (manual) {
        mergedServices.push(prev);
      }
    }
  }

  return {
    version: 1,
    generatedAt: inferred.generatedAt,
    services: mergedServices,
    warnings: inferred.warnings,
  };
}

export function buildRunbook(candidates: ServiceCandidate[]): Runbook {
  const { ordered, warnings } = orderServices(candidates);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    services: ordered.map(candidateToRunbookService),
    warnings,
  };
}

export function readRunbook(root: string): Runbook | undefined {
  const file = runbookPath(root);
  if (!fs.existsSync(file)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Runbook;
  } catch {
    return undefined;
  }
}

export function writeRunbook(root: string, runbook: Runbook): string {
  const file = runbookPath(root);
  fs.writeFileSync(file, JSON.stringify(runbook, null, 2) + '\n', 'utf8');
  return file;
}

export function scanAndPersist(root: string, candidates: ServiceCandidate[]): {
  runbook: Runbook;
  wrotePath: string;
  overwritten: boolean;
} {
  const inferred = buildRunbook(candidates);
  const existing = readRunbook(root);
  const runbook = mergeRunbook(existing, inferred);
  const wrotePath = writeRunbook(root, runbook);
  return { runbook, wrotePath, overwritten: Boolean(existing) };
}
