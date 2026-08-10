import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionManager } from "#pi/session/manager";

const SESSION_ID_RE = /^\d{8}-\d{6}-[0-9a-f]{8}$/;

describe("SessionManager.newSession with custom id", () => {
	it("uses the provided id instead of generating one", () => {
		const session = SessionManager.inMemory();
		session.newSession({ id: "my-custom-id" });
		expect(session.getSessionId()).toBe("my-custom-id");
	});

	it("allows alphanumeric session ids with interior punctuation", () => {
		const session = SessionManager.inMemory();
		session.newSession({ id: "abc-123_def.456" });
		expect(session.getSessionId()).toBe("abc-123_def.456");
	});

	it("rejects invalid custom session ids", () => {
		const invalidIds = ["", "-abc", "abc-", "_abc", "abc_", ".abc", "abc.", "abc/def", "abc\\def", "abc def"];

		for (const id of invalidIds) {
			const session = SessionManager.inMemory();
			expect(() => session.newSession({ id })).toThrow(
				"Session id must start and end with an alphanumeric character",
			);
		}
	});

	it("generates a unique id when none is provided", () => {
		const session = SessionManager.inMemory();
		session.newSession();
		const id = session.getSessionId();
		expect(id).toMatch(SESSION_ID_RE);
	});

	it("includes the custom id in the session header", () => {
		const session = SessionManager.inMemory();
		session.newSession({ id: "header-test-id" });

		expect(session.getHeader().id).toBe("header-test-id");
	});

	it("generates an id when constructed without an explicit id", () => {
		const session = SessionManager.inMemory();
		expect(session.getSessionId()).toMatch(SESSION_ID_RE);
		expect(session.getHeader().id).toBe(session.getSessionId());
	});

	it("uses the provided id when creating a persisted session", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "pi-session-manager-"));
		const session = SessionManager.create(tempDir, tempDir, { id: "created-session-id" });

		expect(session.getSessionId()).toBe("created-session-id");
		expect(session.getHeader().id).toBe("created-session-id");
		const sessionFile = session.getSessionFile()!;
		expect(sessionFile).toContain("created-session-id");
		expect(basename(sessionFile)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_created-session-id\.jsonl$/);
		expect(existsSync(sessionFile)).toBe(false);
	});
});
