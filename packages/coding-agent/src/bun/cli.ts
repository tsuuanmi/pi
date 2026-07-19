#!/usr/bin/env node
import { APP_NAME } from "#coding-agent/core/config/config";

process.title = APP_NAME;
process.emitWarning = (() => {}) as typeof process.emitWarning;

import { restoreSandboxEnv } from "#coding-agent/bun/restore-sandbox-env";

restoreSandboxEnv();

await import("#coding-agent/cli");
