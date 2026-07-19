#!/usr/bin/env node
import { APP_NAME } from "#coding-agent/config/config";

process.title = APP_NAME;
process.emitWarning = (() => {}) as typeof process.emitWarning;

import { restoreSandboxEnv } from "#coding-agent/cli/bun/restore-sandbox-env";

restoreSandboxEnv();

await import("#coding-agent/cli");
