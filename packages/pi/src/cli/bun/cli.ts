#!/usr/bin/env node
import { APP_NAME } from "#pi/config/config";

process.title = APP_NAME;
process.emitWarning = (() => {}) as typeof process.emitWarning;

import { restoreSandboxEnv } from "#pi/cli/bun/restore-sandbox-env";

restoreSandboxEnv();

await import("#pi/cli");
