# @tsuuanmi/pi-internet

Pi package that exposes **ChatGPT Web** as a model backend (and, post-MVP, a Codex native-tool
bridge) through the `codex-chatgpt-web` daemon.

**MVP scope:** model routing only — register the daemon as a Pi `openai-responses` provider plus a
thin tool surface. Codex and Claude Code backends are deferred.

## Status

Scaffolded only. The `src/` tree is empty (no behavior yet). See the design docs:

- [MVP Review & Brainstorm](docs/review-and-brainstorm.md)
- [Multi-Account & Multi-Backend](docs/multi-account-and-backends.md)
- [Architecture](docs/architecture.md)
- [Suggested Layout](docs/layout.md)
- [How it works](docs/how-it-works.md)
- [Pi Ecosystem Integration](docs/pi-integration.md)
