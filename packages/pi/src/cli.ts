#!/usr/bin/env node
/**
 * CLI entry point for the refactored AI agent.
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx src/cli-new.ts [args...]
 */
import { APP_NAME } from "#pi/config/config";
import { configureHttpDispatcher } from "#pi/exec/http-dispatcher";
import { main } from "#pi/main";

process.title = APP_NAME;
process.env.PI = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

// Configure undici's global dispatcher before provider SDKs issue requests.
// Runtime settings are applied once SettingsManager has loaded global/project settings.
configureHttpDispatcher();

main(process.argv.slice(2));
