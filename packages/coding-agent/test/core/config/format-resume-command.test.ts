import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APP_NAME } from "#coding-agent/core/config/config";
import type { SessionManager } from "#coding-agent/core/session/session-manager";
import { formatResumeCommand } from "#coding-agent/modes/interactive/interactive-mode";

const tempDirs: string[] = [];
const originalStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

afterEach(() => {
	if (originalStdoutIsTTY) {
		Object.defineProperty(process.stdout, "isTTY", originalStdoutIsTTY);
	} else {
		Reflect.deleteProperty(process.stdout, "isTTY");
	}

	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function setStdoutIsTTY(value: boolean): void {
	Object.defineProperty(process.stdout, "isTTY", { configurable: true, value });
}

function createTempFile(): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-format-resume-command-"));
	tempDirs.push(dir);
	const file = join(dir, "session.jsonl");
	writeFileSync(file, "\n");
	return file;
}

function createSessionManager(options: {
	persisted?: boolean;
	sessionFile?: string;
	sessionId?: string;
	sessionDir?: string;
	usesDefaultSessionDir?: boolean;
}): SessionManager {
	return {
		isPersisted: () => options.persisted ?? true,
		getSessionFile: () => options.sessionFile,
		getSessionId: () => options.sessionId ?? "0197f6e4-4cf9-7f44-a2d8-f8f7f49ee9d3",
		getSessionDir: () => options.sessionDir ?? "/tmp/pi-sessions",
		usesDefaultSessionDir: () => options.usesDefaultSessionDir ?? true,
	} as unknown as SessionManager;
}

describe("formatResumeCommand", () => {
	it("returns a session resume command for default session dirs", () => {
		setStdoutIsTTY(true);
		const sessionFile = createTempFile();
		const sessionManager = createSessionManager({ sessionFile, sessionId: "test-session" });

		expect(formatResumeCommand(sessionManager)).toBe(`${APP_NAME} --session test-session`);
	});

	it("uses the session file path for non-default session dirs", () => {
		setStdoutIsTTY(true);
		const sessionFile = createTempFile();
		const sessionManager = createSessionManager({
			sessionFile,
			sessionId: "test-session",
			usesDefaultSessionDir: false,
		});

		expect(formatResumeCommand(sessionManager)).toBe(`${APP_NAME} --session ${sessionFile}`);
	});

	it("quotes non-default session file paths containing spaces", () => {
		setStdoutIsTTY(true);
		const dir = mkdtempSync(join(tmpdir(), "pi format resume command "));
		tempDirs.push(dir);
		const sessionFile = join(dir, "session.jsonl");
		writeFileSync(sessionFile, "\n");
		const sessionManager = createSessionManager({
			sessionFile,
			sessionId: "test-session",
			usesDefaultSessionDir: false,
		});

		expect(formatResumeCommand(sessionManager)).toBe(`${APP_NAME} --session '${sessionFile}'`);
	});

	it("quotes non-default session file paths containing single quotes", () => {
		setStdoutIsTTY(true);
		const dir = mkdtempSync(join(tmpdir(), "pi-format-resume-command-'"));
		tempDirs.push(dir);
		const sessionFile = join(dir, "session.jsonl");
		writeFileSync(sessionFile, "\n");
		const sessionManager = createSessionManager({
			sessionFile,
			sessionId: "test-session",
			usesDefaultSessionDir: false,
		});

		expect(formatResumeCommand(sessionManager)).toBe(`${APP_NAME} --session '${sessionFile.replace(/'/g, `'\\''`)}'`);
	});

	it("returns undefined when stdout is not a TTY", () => {
		setStdoutIsTTY(false);
		const sessionFile = createTempFile();
		const sessionManager = createSessionManager({ sessionFile });

		expect(formatResumeCommand(sessionManager)).toBeUndefined();
	});

	it("returns undefined for in-memory sessions", () => {
		setStdoutIsTTY(true);
		const sessionFile = createTempFile();
		const sessionManager = createSessionManager({ persisted: false, sessionFile });

		expect(formatResumeCommand(sessionManager)).toBeUndefined();
	});

	it("returns undefined when the session file is missing", () => {
		setStdoutIsTTY(true);
		const sessionManager = createSessionManager({ sessionFile: "/tmp/pi-missing-session.jsonl" });

		expect(formatResumeCommand(sessionManager)).toBeUndefined();
	});

	it("returns undefined when the session file is not set", () => {
		setStdoutIsTTY(true);
		const sessionManager = createSessionManager({ sessionFile: undefined });

		expect(formatResumeCommand(sessionManager)).toBeUndefined();
	});
});
