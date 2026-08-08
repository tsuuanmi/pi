#!/usr/bin/env node
import { APP_NAME } from "#pi/loader/app";
import { main } from "#pi/main";
/**
 * CLI entry point for the refactored AI agent.
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx src/cli/cli.ts [args...]
 */
import { configureHttpDispatcher } from "#pi/network/http-dispatcher";

process.title = APP_NAME;
process.env.PI = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

// Configure undici's global dispatcher before provider SDKs issue requests.
// Runtime settings are applied once SettingsManager has loaded global/project settings.
configureHttpDispatcher();

main(process.argv.slice(2));
