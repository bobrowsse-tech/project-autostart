# Project Autostart

Infers how to start and stop an unfamiliar repo and runs it with one click.

Open a workspace, open the **Project Autostart** side panel, then:

1. **Scan & Generate Plan** — fingerprints npm scripts, Docker Compose, Procfile, Python, and Makefile targets, then writes a dependency-ordered `.runbook.json` you can review.
2. **Start Project** — runs each step in order, waiting for health checks (TCP / HTTP / grace period) before continuing.
3. **Stop Project** — tears down tracked processes (and compose services) in reverse order.
4. **View Logs** / **Edit Runbook** — inspect interleaved service logs or fix a wrong command/health check by hand.

Agents (Copilot Chat, Claude Code, and other Language Model Tool clients) can call `project_autostart_run` with `scan`, `start`, `stop`, or `status`.

## Development

```bash
npm install
npm run watch    # esbuild + tsc in watch mode
npm run test:unit
```

Press `F5` in VS Code to launch an Extension Development Host.

## License

MIT
