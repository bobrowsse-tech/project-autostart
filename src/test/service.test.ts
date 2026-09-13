import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintRepo, orderServices, buildRunbook, mergeRunbook, scanAndPersist } from '../service';
import type { Runbook } from '../service';

const fixtures = path.join(__dirname, 'fixtures');

describe('fingerprintRepo', () => {
  it('finds npm start/dev scripts in a Node app', () => {
    const candidates = fingerprintRepo(path.join(fixtures, 'node-app'));
    assert.ok(candidates.some((c) => c.kind === 'npm' && c.command.includes('npm run')));
  });

  it('parses compose services, ports, and depends_on', () => {
    const candidates = fingerprintRepo(path.join(fixtures, 'compose-stack'));
    const ids = candidates.map((c) => c.id).sort();
    assert.deepEqual(ids, ['compose:api', 'compose:db', 'compose:web']);
    const api = candidates.find((c) => c.id === 'compose:api')!;
    assert.ok(api.dependsOn.includes('compose:db'));
    assert.ok(api.ports.includes(3000));
  });

  it('discovers mixed Node + Python + compose stacks', () => {
    const candidates = fingerprintRepo(path.join(fixtures, 'mixed-stack'));
    assert.ok(candidates.some((c) => c.kind === 'compose'));
    assert.ok(candidates.some((c) => c.kind === 'npm' || c.kind === 'procfile'));
    assert.ok(candidates.some((c) => c.kind === 'python' || c.kind === 'procfile'));
  });
});

describe('orderServices', () => {
  it('topologically sorts compose depends_on', () => {
    const candidates = fingerprintRepo(path.join(fixtures, 'compose-stack'));
    const { ordered, warnings } = orderServices(candidates);
    const ids = ordered.map((c) => c.id);
    assert.ok(ids.indexOf('compose:db') < ids.indexOf('compose:api'));
    assert.ok(ids.indexOf('compose:api') < ids.indexOf('compose:web'));
    assert.equal(warnings.filter((w) => w.includes('cycle')).length, 0);
  });

  it('surfaces cycles as warnings instead of throwing', () => {
    const { ordered, warnings } = orderServices([
      {
        id: 'a',
        kind: 'npm',
        command: 'a',
        cwd: '.',
        ports: [],
        dependsOn: ['b'],
      },
      {
        id: 'b',
        kind: 'npm',
        command: 'b',
        cwd: '.',
        ports: [],
        dependsOn: ['a'],
      },
    ]);
    assert.equal(ordered.length, 2);
    assert.ok(warnings.some((w) => w.toLowerCase().includes('cycle')));
  });
});

describe('runbook persistence', () => {
  it('writes .runbook.json and preserves manual fields on re-scan', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autostart-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'tmp', scripts: { start: 'node x.js' } })
      );
      const first = scanAndPersist(dir, fingerprintRepo(dir));
      assert.ok(fs.existsSync(first.wrotePath));
      assert.equal(first.runbook.services[0].command, 'npm run start');

      const manual: Runbook = {
        ...first.runbook,
        services: first.runbook.services.map((s) => ({
          ...s,
          command: 'node custom.js',
          fieldSources: { ...s.fieldSources, command: 'manual' as const },
        })),
      };
      fs.writeFileSync(first.wrotePath, JSON.stringify(manual, null, 2));

      const second = scanAndPersist(dir, fingerprintRepo(dir));
      assert.equal(second.runbook.services[0].command, 'node custom.js');
      assert.equal(second.overwritten, true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('buildRunbook sets version and generatedAt', () => {
    const rb = buildRunbook(fingerprintRepo(path.join(fixtures, 'node-app')));
    assert.equal(rb.version, 1);
    assert.ok(rb.generatedAt);
    assert.ok(rb.services.length >= 1);
  });

  it('mergeRunbook keeps manual-only services', () => {
    const inferred = buildRunbook([]);
    const existing: Runbook = {
      version: 1,
      generatedAt: '2020-01-01T00:00:00.000Z',
      warnings: [],
      services: [
        {
          id: 'manual:extra',
          command: 'echo hi',
          cwd: '.',
          dependsOn: [],
          kind: 'npm',
          fieldSources: { command: 'manual' },
        },
      ],
    };
    const merged = mergeRunbook(existing, inferred);
    assert.ok(merged.services.some((s) => s.id === 'manual:extra'));
  });
});
