import { createInterface } from "node:readline";
import { resolvePath } from "@tsuuanmi/pi-agent/node";
import { initTheme, stopThemeWatcher } from "@tsuuanmi/pi-tui";
import chalk from "chalk";
import type { Args } from "#pi/cli/args";
import { selectSession } from "#pi/cli/session-picker";
import { showStartupSelector } from "#pi/cli/startup-ui";
import { ENV_SESSION_DIR, expandTildePath } from "#pi/config/config";
import type { AppMode } from "#pi/app/modes";
import {
	formatMissingSessionCwdPrompt,
	getMissingSessionCwdIssue,
	MissingSessionCwdError,
	type SessionCwdIssue,
} from "#pi/session/cwd";
import { SessionManager } from "#pi/session/manager";
import type { SettingsManager } from "#pi/settings/settings-manager";

export interface StartupSession {
	sessionDir: string | undefined;
	sessionManager: SessionManager;
}

type ResolvedSession =
	| { type: "path"; path: string }
	| { type: "local"; path: string }
	| { type: "global"; path: string; cwd: string }
	| { type: "not_found"; arg: string };

async function resolveSessionPath(sessionArg: string, cwd: string, sessionDir?: string): Promise<ResolvedSession> {
	if (sessionArg.includes("/") || sessionArg.includes("\\") || sessionArg.endsWith(".jsonl")) {
		return { type: "path", path: resolvePath(sessionArg, cwd) };
	}

	const localSessions = await SessionManager.list(cwd, sessionDir);
	const localMatch =
		localSessions.find((session) => session.id === sessionArg) ??
		localSessions.find((session) => session.id.startsWith(sessionArg));
	if (localMatch) return { type: "local", path: localMatch.path };

	const allSessions = await SessionManager.listAll(sessionDir);
	const globalMatch =
		allSessions.find((session) => session.id === sessionArg) ??
		allSessions.find((session) => session.id.startsWith(sessionArg));
	if (globalMatch) return { type: "global", path: globalMatch.path, cwd: globalMatch.cwd };

	return { type: "not_found", arg: sessionArg };
}

async function confirm(message: string): Promise<boolean> {
	return new Promise((resolve) => {
		const reader = createInterface({ input: process.stdin, output: process.stdout });
		reader.question(`${message} [y/N] `, (answer) => {
			reader.close();
			resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
		});
	});
}

function forkSession(sourcePath: string, cwd: string, sessionDir?: string): SessionManager {
	try {
		return SessionManager.forkFrom(sourcePath, cwd, sessionDir);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(chalk.red(`Error: ${message}`));
		process.exit(1);
	}
}

async function createSessionManager(
	parsed: Args,
	cwd: string,
	sessionDir: string | undefined,
	settingsManager: SettingsManager,
): Promise<SessionManager> {
	if (parsed.help || parsed.listModels !== undefined) return SessionManager.inMemory(cwd);

	if (parsed.session) {
		const resolved = await resolveSessionPath(parsed.session, cwd, sessionDir);
		switch (resolved.type) {
			case "path":
			case "local":
				return SessionManager.open(resolved.path, sessionDir);
			case "global": {
				console.log(chalk.yellow(`Session found in different project: ${resolved.cwd}`));
				if (!(await confirm("Fork this session into current directory?"))) {
					console.log(chalk.dim("Aborted."));
					process.exit(0);
				}
				return forkSession(resolved.path, cwd, sessionDir);
			}
			case "not_found":
				console.error(chalk.red(`No session found matching '${resolved.arg}'`));
				process.exit(1);
		}
	}

	if (parsed.resume) {
		initTheme(settingsManager.getTheme(), true);
		try {
			const selectedPath = await selectSession(
				(onProgress) => SessionManager.list(cwd, sessionDir, onProgress),
				(onProgress) => SessionManager.listAll(sessionDir, onProgress),
			);
			if (!selectedPath) {
				console.log(chalk.dim("No session selected"));
				process.exit(0);
			}
			return SessionManager.open(selectedPath, sessionDir);
		} finally {
			stopThemeWatcher();
		}
	}

	if (parsed.continue) return SessionManager.continueRecent(cwd, sessionDir);
	return SessionManager.create(cwd, sessionDir);
}

function getSessionDir(settingsManager: SettingsManager): string | undefined {
	const envSessionDir = process.env[ENV_SESSION_DIR];
	return (envSessionDir ? expandTildePath(envSessionDir) : undefined) ?? settingsManager.getSessionDir();
}

async function selectMissingCwd(issue: SessionCwdIssue, settingsManager: SettingsManager): Promise<string | undefined> {
	return showStartupSelector(settingsManager, formatMissingSessionCwdPrompt(issue), [
		{ label: "Continue", value: issue.fallbackCwd },
		{ label: "Cancel", value: undefined },
	]);
}

function applySessionName(sessionManager: SessionManager, nameArg: string | undefined): void {
	if (nameArg === undefined) return;
	const name = nameArg.trim();
	if (!name) {
		console.error(chalk.red("Error: --name requires a non-empty value"));
		process.exit(1);
	}
	sessionManager.appendSessionInfo(name);
}

export async function createStartupSession(
	parsed: Args,
	cwd: string,
	appMode: AppMode,
	settingsManager: SettingsManager,
): Promise<StartupSession> {
	const sessionDir = getSessionDir(settingsManager);
	let sessionManager = await createSessionManager(parsed, cwd, sessionDir, settingsManager);
	const missingCwd = getMissingSessionCwdIssue(sessionManager, cwd);
	if (missingCwd) {
		if (appMode === "interactive") {
			const selectedCwd = await selectMissingCwd(missingCwd, settingsManager);
			if (!selectedCwd) process.exit(0);
			sessionManager = SessionManager.open(missingCwd.sessionFile!, sessionDir, selectedCwd);
		} else {
			console.error(chalk.red(new MissingSessionCwdError(missingCwd).message));
			process.exit(1);
		}
	}

	applySessionName(sessionManager, parsed.name);
	return { sessionDir, sessionManager };
}
