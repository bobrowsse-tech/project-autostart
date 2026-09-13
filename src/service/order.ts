import type { ServiceCandidate } from './types';

const DB_PORTS = new Set([5432, 6379, 27017, 3306, 1433, 9200]);

export interface OrderResult {
  ordered: ServiceCandidate[];
  warnings: string[];
}

function applyHeuristicDeps(candidates: ServiceCandidate[]): void {
  const byPort = new Map<number, string>();
  for (const c of candidates) {
    for (const p of c.ports) {
      if (DB_PORTS.has(p)) {
        byPort.set(p, c.id);
      }
    }
  }

  for (const c of candidates) {
    if (c.dependsOn.length) {
      continue;
    }
    const env = c.envHints ?? {};
    const blob = JSON.stringify(env).toUpperCase();
    const hints: Array<{ key: string; port: number }> = [
      { key: 'DATABASE_URL', port: 5432 },
      { key: 'POSTGRES', port: 5432 },
      { key: 'REDIS_URL', port: 6379 },
      { key: 'MONGO', port: 27017 },
      { key: 'MYSQL', port: 3306 },
    ];
    for (const h of hints) {
      if (blob.includes(h.key) && byPort.has(h.port) && byPort.get(h.port) !== c.id) {
        c.dependsOn.push(byPort.get(h.port)!);
      }
    }
    // Non-compose app services typically wait on compose DB services when present.
    if (c.kind !== 'compose') {
      for (const db of candidates.filter((x) => x.kind === 'compose' && x.ports.some((p) => DB_PORTS.has(p)))) {
        if (!c.dependsOn.includes(db.id)) {
          c.dependsOn.push(db.id);
        }
      }
    }
  }
}

/**
 * Topologically sort candidates. Cycles become warnings; cyclic nodes are
 * appended after acyclic ones in discovery order.
 */
export function orderServices(candidates: ServiceCandidate[]): OrderResult {
  const cloned = candidates.map((c) => ({ ...c, dependsOn: [...c.dependsOn], ports: [...c.ports] }));
  applyHeuristicDeps(cloned);

  const ids = new Set(cloned.map((c) => c.id));
  const warnings: string[] = [];
  for (const c of cloned) {
    c.dependsOn = c.dependsOn.filter((d) => {
      if (!ids.has(d)) {
        warnings.push(`Dependency "${d}" referenced by "${c.id}" was not found; ignored.`);
        return false;
      }
      return true;
    });
  }

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const c of cloned) {
    indegree.set(c.id, 0);
    dependents.set(c.id, []);
  }
  for (const c of cloned) {
    for (const d of c.dependsOn) {
      indegree.set(c.id, (indegree.get(c.id) ?? 0) + 1);
      dependents.get(d)!.push(c.id);
    }
  }

  const queue = cloned.filter((c) => (indegree.get(c.id) ?? 0) === 0).map((c) => c.id);
  const orderedIds: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    orderedIds.push(id);
    for (const next of dependents.get(id) ?? []) {
      const n = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, n);
      if (n === 0) {
        queue.push(next);
      }
    }
  }

  if (orderedIds.length !== cloned.length) {
    const cyclic = cloned.filter((c) => !orderedIds.includes(c.id)).map((c) => c.id);
    warnings.push(`Dependency cycle detected among: ${cyclic.join(', ')}. They will start after independent services.`);
    orderedIds.push(...cyclic);
  }

  const byId = new Map(cloned.map((c) => [c.id, c]));
  return {
    ordered: orderedIds.map((id) => byId.get(id)!),
    warnings,
  };
}
