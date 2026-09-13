
# Build Directive — Project Autostart

> Rank **#1** in the Unbuilt VS Code Tools roadmap. This directive is written for an AI coding agent (Claude Code, Copilot agent mode, or a human following along) to execute directly. The `project-autostart/` folder next to this file already contains a working scaffold — activation, side-panel dashboard, command registration, and a Language Model Tool stub — generated per the shared conventions in `../AGENTS.md`. Everything marked `TODO` below is the real remaining work.

## 1. Objective

Detect every runnable service in a repo (Node/npm scripts, Python/Poetry, Docker Compose, Procfile, Makefile), compute a dependency-ordered start plan (datastore before API before frontend), execute it with health-check gating between steps, and persist the plan as an editable, checked-in runbook so teammates inherit it for free.

## 2. Why this doesn't already exist

Every existing tool (npm scripts, Makefiles, docker-compose) requires the repo to already document its own run steps. Nothing infers them from what's actually present and orchestrates a mixed stack (e.g. Postgres + a Node API + a Python worker) as one operation.

## 3. VS Code surfaces this extension uses

- **Activity bar view container**: `project-autostartContainer` (icon: `play-circle`)
- **Side panel dashboard**: `project-autostartView`, a `WebviewViewProvider` — see `src/dashboardProvider.ts`
- **Commands**: `projectAutostart.scan`, `projectAutostart.start`, `projectAutostart.stop`, `projectAutostart.viewLogs`, `projectAutostart.editRunbook`
- **Language Model Tool**: `project_autostart_run` — see `src/lmTool.ts` and `contributes.languageModelTools` in `package.json`. This is what lets Copilot Chat, Claude Code, or any other MCP/agent-aware surface invoke this extension's core action conversationally instead of the user hunting for the right command.

## 4. Dashboard (side panel) spec

The sidebar webview is the primary UI. It must show, at minimum, the buttons below plus a status/summary area above them (current scan state, last-run timestamp, or a short result summary — specifics depend on the feature, see phase notes).

| Button | Command | Behavior |
|---|---|---|
| **Scan & Generate Plan** | `projectAutostart.scan` | Fingerprints the repo, builds the dependency graph, writes/updates .runbook.json, and renders the plan in the dashboard for review before anything runs. |
| **Start Project** | `projectAutostart.start` | Executes the runbook step by step, polling each service's declared health check (port open / HTTP 200) before starting the next, streaming output into a dedicated output channel. |
| **Stop Project** | `projectAutostart.stop` | Tears down every process/container the runbook started, using tracked PIDs (tree-kill) or `docker compose down`, in reverse start order. |
| **View Logs** | `projectAutostart.viewLogs` | Opens the output channel showing interleaved, color-coded logs per service for the current run. |
| **Edit Runbook** | `projectAutostart.editRunbook` | Opens .runbook.json for manual correction when the inferred plan gets a command or health check wrong. |

Buttons call `vscode.commands.executeCommand`, not the tool logic directly — keep exactly one implementation of the core logic (a plain TypeScript service module with no VS Code imports) called from three places: the command handler, the dashboard's message handler, and the Language Model Tool's `invoke`. Do not fork the logic across these three entry points.

## 5. Implementation phases

1. **Repo fingerprinting** — Walk the workspace root (respecting .gitignore via the `ignore` package) for: package.json (read `scripts`, detect a `start`/`dev` script and its declared `engines`), pyproject.toml / requirements.txt + a Procfile, docker-compose.yml / compose.yaml (parse with `yaml`, extract services, `depends_on`, `ports`, `healthcheck`), and a Makefile (regex-scan target names for `run`, `start`, `serve`, `up`). Produce a normalized `ServiceCandidate[]`: {id, kind, command, cwd, ports, dependsOn, healthCheck}.
2. **Dependency ordering** — Topologically sort ServiceCandidate[] using explicit `depends_on` from compose, and a heuristic fallback (a service binding a DB port like 5432/6379/27017 starts before any service whose env vars reference `DATABASE_URL`/`REDIS_URL` pointing at that port). Detect cycles and surface them as a warning rather than failing silently.
3. **Runbook persistence** — Serialize the ordered plan to `.runbook.json` at the workspace root: `{ version, services: [{id, command, cwd, healthCheck: {type: 'tcp'|'http', target}, dependsOn}] }`. If the file already exists, diff against the freshly inferred plan and only prompt to overwrite fields the user hasn't manually edited (track a `source: 'inferred'|'manual'` flag per field).
4. **Execution engine** — For `start`: iterate the plan, spawn each command with `execa(cmd, {cwd, shell:true, all:true})`, pipe `.all` into a per-service prefixed line in a shared `vscode.OutputChannel`, and before starting the next dependent service, poll its predecessor's health check (tcp-port-used.check or an HTTP GET with retry/backoff, 30s timeout with a clear failure message naming which service didn't come up). Track child PIDs in `context.workspaceState` so `stop` survives a VS Code restart.
5. **Stop engine** — For `stop`: read tracked PIDs/container names, call `tree-kill(pid, 'SIGTERM')` for spawned processes (SIGKILL after a 5s grace period) and `docker compose down` for compose-based services, in reverse start order.
6. **Dashboard wiring** — WebviewView shows: current status per service (idle/starting/healthy/failed) as a colored pill, the five buttons above, and a live-tailing log pane fed by `postMessage` from the extension as new output lines arrive.
7. **Language Model Tool** — Register `project_autostart_run` so an agent (Copilot Chat, Claude Code, etc.) can scan/start/stop/status the project conversationally instead of guessing terminal commands.
8. **Tests** — Unit-test the fingerprinter and topological sort against fixture repos (a plain Node app, a compose stack, a Node+Python mixed repo) under `src/test/fixtures/`. Integration-test start/stop against a fixture using `@vscode/test-electron`.

## 6. Suggested dependencies

`execa`, `tree-kill`, `get-port`, `tcp-port-used`, `yaml`, `toml`, `chokidar`

Install as regular `dependencies` (already stubbed into `package.json` — replace the `"latest"` version pins with the actual resolved versions once installed, per the pinning convention in `AGENTS.md`).

## 7. Edge cases & safety notes

- A service with no discoverable health check (no exposed port, no HTTP endpoint) — fall back to a fixed grace-period delay and say so explicitly in the dashboard, don't silently guess.
- Ports already in use from a previous unclean stop — detect via tcp-port-used before starting and offer to kill the stale process rather than failing.
- Monorepos with multiple independently runnable apps — let the user scope a scan to a subdirectory instead of assuming one runbook for the whole workspace.
- Never execute a command straight from a Makefile/compose file without showing it to the user first — the dashboard's scan step is a review gate, not a silent auto-run.

## 8. Definition of done

- [ ] Core logic lives in a VS Code-free service module, unit-tested against fixtures (see phase notes above for what fixtures to build).
- [ ] All buttons in the dashboard spec are wired to real behavior, not the placeholder `showInformationMessage` stub.
- [ ] The Language Model Tool calls the same service module and returns a concise, agent-readable text result (not raw JSON dumped as text).
- [ ] No destructive or external-write action (file rewrite, PR post, process kill) runs without an explicit user-initiated click — the LM tool path in particular must stay read/report-only unless the directive above says otherwise.
- [ ] `npm run package` produces a `dist/extension.js` with no bundling warnings; `vsce package` produces a `.vsix` that installs cleanly via `code --install-extension`.
- [ ] README.md (user-facing, not this directive) documents what the extension does in plain language, per `AGENTS.md`'s copy conventions.
    