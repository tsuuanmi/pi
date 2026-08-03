/**
 * Main entry point for the Pi CLI.
 *
 * This file handles CLI argument parsing and translates them into
 * createAgentSession() options. The SDK does the heavy lifting.
 */

import { initTheme } from "@tsuuanmi/pi-tui";
import chalk from "chalk";
import type { ExtensionFactory } from "#pi/api/extension-types";
import { bootstrapStartup, runStartupMigrations } from "#pi/app/bootstrap";
import { runStartupCommands } from "#pi/app/commands";
import { applyStdoutMode, prepareInput, resolveStartupMode } from "#pi/app/input";
import { runAppMode } from "#pi/app/modes";
import { collectSettingsDiagnostics, createAppRuntime } from "#pi/app/runtime";
import { createStartupSession } from "#pi/app/session";
import { parseArgs, printHelp } from "#pi/cli/args";
import { launchDefaultTmuxIfNeeded } from "#pi/cli/launch-tmux";
import { listModels } from "#pi/cli/list-models";
import { VERSION } from "#pi/loader/app";
import { showDeprecationWarnings } from "#pi/migrations";
import type { AgentSessionRuntimeDiagnostic } from "#pi/runtime/services";
import { SettingsManager } from "#pi/settings/settings-manager";

function reportDiagnostics(diagnostics: readonly AgentSessionRuntimeDiagnostic[]): void {
	for (const diagnostic of diagnostics) {
		const color = diagnostic.type === "error" ? chalk.red : diagnostic.type === "warning" ? chalk.yellow : chalk.dim;
		const prefix = diagnostic.type === "error" ? "Error: " : diagnostic.type === "warning" ? "Warning: " : "";
		console.error(color(`${prefix}${diagnostic.message}`));
	}
}

export interface MainOptions {
	extensionFactories?: ExtensionFactory[];
}

export async function main(args: string[], options?: MainOptions) {
	const { cwd, agentDir } = bootstrapStartup();

	if (await runStartupCommands(args, { extensionFactories: options?.extensionFactories })) return;

	const parsed = parseArgs(args);
	if (parsed.diagnostics.length > 0) {
		for (const d of parsed.diagnostics) {
			const color = d.type === "error" ? chalk.red : chalk.yellow;
			console.error(color(`${d.type === "error" ? "Error" : "Warning"}: ${d.message}`));
		}
		if (parsed.diagnostics.some((d) => d.type === "error")) {
			process.exit(1);
		}
	}

	if (parsed.version) {
		console.log(VERSION);
		process.exit(0);
	}

	if (launchDefaultTmuxIfNeeded({ parsed, rawArgs: args, cwd })) {
		return;
	}

	let appMode = resolveStartupMode(parsed);
	applyStdoutMode(appMode, parsed);

	if (parsed.mode === "rpc" && parsed.fileArgs.length > 0) {
		console.error(chalk.red("Error: @file arguments are not supported in RPC mode"));
		process.exit(1);
	}

	// Run migrations (pass cwd for project-local migrations)
	const { migratedProviders, deprecationWarnings } = runStartupMigrations(cwd);

	const startupSettingsManager = SettingsManager.create(cwd, agentDir);
	reportDiagnostics(collectSettingsDiagnostics(startupSettingsManager, "startup session lookup"));

	// Decide the final runtime cwd before creating cwd-bound runtime services.
	// --session and --resume may select a session from another project, so project-local
	// settings, resources, provider registrations, and models must be resolved only after
	// the target session cwd is known. The startup-cwd settings manager is used only for
	// sessionDir lookup during session selection.
	const { sessionManager } = await createStartupSession(parsed, cwd, appMode, startupSettingsManager);

	const runtime = await createAppRuntime({
		parsed,
		agentDir,
		sessionManager,
		extensionFactories: options?.extensionFactories,
	});
	const { services, modelStartupWarning } = runtime;
	const { settingsManager, modelRegistry, resourceLoader } = services;

	if (parsed.help) {
		const extensionFlags = resourceLoader
			.getExtensions()
			.extensions.flatMap((extension) => Array.from(extension.flags.values()));
		printHelp(extensionFlags);
		process.exit(0);
	}

	if (parsed.listModels !== undefined) {
		const searchPattern = typeof parsed.listModels === "string" ? parsed.listModels : undefined;
		await listModels(modelRegistry, searchPattern);
		process.exit(0);
	}

	const preparedInput = await prepareInput(parsed, appMode);
	appMode = preparedInput.appMode;

	const { initialMessage } = preparedInput;
	initTheme(settingsManager.getTheme());

	// Show deprecation warnings in interactive mode
	if (appMode === "interactive" && deprecationWarnings.length > 0) {
		await showDeprecationWarnings(deprecationWarnings);
	}

	reportDiagnostics(runtime.diagnostics);
	if (runtime.diagnostics.some((diagnostic) => diagnostic.type === "error")) {
		process.exit(1);
	}

	await runAppMode({
		appMode,
		runtime,
		parsed,
		initialMessage,
		migratedProviders,
		modelStartupWarning,
	});
}
