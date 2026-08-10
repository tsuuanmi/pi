import { resolvePath } from "@tsuuanmi/pi-agent/node";
import { initTheme } from "@tsuuanmi/pi-tui";
import chalk from "chalk";
import type { AppMode } from "#pi/app/modes";
import type { Args } from "#pi/cli/args";
import { selectSession } from "#pi/cli/session-picker";
import { showStartupSelector } from "#pi/cli/startup-ui";
import { ENV_SESSION_DIR } from "#pi/loader/app";
import { expandTildePath } from "#pi/loader/paths";
import {
	formatMissingSessionCwdPrompt,
	getMissingSessionCwdIssue,
	MissingSessionCwdError,
	type SessionCwdIssue,
} from "#pi/session/cwd";
import { SessionManager } from "#pi/session/manager";
import type { SettingsManager } from "#pi/settings/manager";

export interface StartupSession {
	sessionDir: string | undefined;
	sessionManager: SessionManager;
}

async function resolveSessionPath(sessionArg: string, cwd: string, sessionDir?: string): Promise<string | undefined> {
	if (sessionArg.includes("/") || sessionArg.includes("\\") || sessionArg.endsWith(".jsonl")) {
		return resolvePath(sessionArg, cwd);
	}

	const sessions = await SessionManager.list(cwd, sessionDir);
	const match =
		sessions.find((session) => session.id === sessionArg) ??
		sessions.find((session) => session.id.startsWith(sessionArg));
	return match?.path;
}

async function createSessionManager(
	parsed: Args,
	cwd: string,
	sessionDir: string | undefined,
	settingsManager: SettingsManager,
): Promise<SessionManager> {
	if (parsed.help || parsed.listModels !== undefined) return SessionManager.inMemory(cwd);

	if (parsed.session) {
		const sessionPath = await resolveSessionPath(parsed.session, cwd, sessionDir);
		if (sessionPath) return SessionManager.open(sessionPath, sessionDir);
		console.error(chalk.red(`No session found matching '${parsed.session}'`));
		process.exit(1);
	}

	if (parsed.resume) {
		initTheme(settingsManager.getTheme());
		const selectedPath = await selectSession(
			(onProgress, offset, limit) => SessionManager.listPage(cwd, sessionDir, onProgress, offset, limit),
			(onProgress, offset, limit) => SessionManager.listAllPage(sessionDir, onProgress, offset, limit),
		);
		if (!selectedPath) {
			console.log(chalk.dim("No session selected"));
			process.exit(0);
		}
		return SessionManager.open(selectedPath, sessionDir);
	}

	if (parsed.continue) return SessionManager.openRecent(cwd, sessionDir);
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
