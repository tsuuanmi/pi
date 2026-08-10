<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/pi/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

# Pi Agent Harness Mono Repo

This is the home of the pi agent harness project including our self extensible AI agent.

* **[@tsuuanmi/pi-ai](packages/ai)**: Provider-neutral model and streaming protocol
* **[@tsuuanmi/pi-agent](packages/agent)**: Single-agent runtime, tools, hooks, and subagent contracts
* **[@tsuuanmi/pi-orchestrator](packages/orchestrator)**: Task, team, routing, and multi-agent orchestration primitives
* **[@tsuuanmi/pi-tui](packages/tui)**: Terminal UI components and differential rendering
* **[@tsuuanmi/pi-workflows](packages/workflows)**: Gated workflow skills, state, tools, and orchestration adapters
* **[@tsuuanmi/pi](packages/pi)**: Interactive CLI, SDK, sessions, extensions, and application composition

To learn more about pi:

* [Visit pi.dev](https://pi.dev), the project website with demos
* [Read the documentation](https://pi.dev/docs/latest), but you can also ask the agent to explain itself
* [See the current package architecture](docs/architecture/package-overview.md) for components, dependencies, boundaries, and runtime interactions

## Share your OSS Pi sessions

If you use pi or other AI agents for open source work, please share your sessions.

Public OSS session data helps improve AI agents with real-world tasks, tool use, failures, and fixes instead of toy benchmarks.

For the full explanation, see [this post on X](https://x.com/badlogicgames/status/2037811643774652911).

To publish sessions, use [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf). Read its README.md for setup instructions. All you need is a Hugging Face account, the Hugging Face CLI, and `pi-share-hf`.

You can also watch [this video](https://x.com/badlogicgames/status/2041151967695634619), where I show how I publish my `pi-mono` sessions.

I regularly publish my own `pi-mono` work sessions here:

- [badlogicgames/pi-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)

## All Packages

| Package | Description |
|---------|-------------|
| **[@tsuuanmi/pi-ai](packages/ai)** | Provider-neutral model, provider, OAuth, and streaming protocol |
| **[@tsuuanmi/pi-agent](packages/agent)** | Single-agent runtime with tools, hooks, events, and subagent contracts |
| **[@tsuuanmi/pi-orchestrator](packages/orchestrator)** | Task DAG, team, routing, retry, verification, and checkpoint primitives |
| **[@tsuuanmi/pi-tui](packages/tui)** | Terminal UI library with components, input, themes, and differential rendering |
| **[@tsuuanmi/pi-workflows](packages/workflows)** | Deep Interview, Ralplan, Team, and Ultragoal workflow runtime |
| **[@tsuuanmi/pi](packages/pi)** | Interactive CLI, SDK, sessions, extensions, tools, and application host |

See [Package Overview](docs/architecture/package-overview.md) for the dependency graph, [Component Integration Map](docs/architecture/component-integration-map.md) for exact import/load/use seams, and [Package Overlap Audit](docs/architecture/package-overlap-audit.md) for ownership and duplicate-logic findings.

## Permissions & Containerization

Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it.

If you need stronger boundaries, containerize or sandbox Pi. See [packages/pi/docs/containerization.md](packages/pi/docs/containerization.md) for two patterns:

- **Plain Docker**: run the whole `pi` process in a local container for simple isolation.
- **OpenShell**: run the whole `pi` process in a policy-controlled sandbox.



## Development

```bash
npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi.sh         # Run pi from sources (can be run from any directory)
```

## Supply-chain hardening

We treat npm dependency changes as reviewed code changes.

- Direct external dependencies are pinned to exact versions. Internal workspace packages remain version-ranged.
- `package-lock.json` is the dependency ground truth and dependency changes should be reviewed explicitly.
- `npm run check` verifies pinned direct deps, native TypeScript import compatibility, and the generated pi shrinkwrap.
- The published CLI package includes `packages/pi/npm-shrinkwrap.json`, generated from the root lockfile, to pin transitive deps for npm users.
- Release smoke tests use `npm run release:local` to build, pack, and create an isolated npm install outside the repo before tagging a release.
- Local release installs and documented npm installs use `--ignore-scripts` where supported.
- CI installs with `npm ci --ignore-scripts`, and a scheduled GitHub workflow runs `npm audit --omit=dev` plus `npm audit signatures --omit=dev`.
- Shrinkwrap generation has an explicit allowlist for dependency lifecycle scripts; new lifecycle-script deps fail checks until reviewed.

## License

MIT
