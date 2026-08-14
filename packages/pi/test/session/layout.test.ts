import { join } from "node:path";
import {
	sessionActiveStatePath,
	sessionApiUsagePath,
	sessionArtifactsDir,
	sessionAuditPath,
	sessionPlansDir,
	sessionSkillsDir,
	sessionSpecsDir,
	sessionSubagentDir,
	sessionTransactionPath,
	sessionTransactionsDir,
	skillDir,
	skillExecutionsDir,
	skillStatePath,
} from "@tsuuanmi/pi/session/layout";
import { describe, expect, it } from "vitest";

const cwd = "/project";
const sessionId = "session-1";
const root = join(cwd, ".pi", sessionId);

describe("session layout", () => {
	it("resolves shared state paths", () => {
		expect(sessionAuditPath(cwd, sessionId)).toBe(join(root, "state", "audit.jsonl"));
		expect(sessionTransactionsDir(cwd, sessionId)).toBe(join(root, "state", "transactions"));
		expect(sessionTransactionPath(cwd, sessionId, "mutation-1")).toBe(
			join(root, "state", "transactions", "mutation-1.json"),
		);
		expect(sessionSubagentDir(cwd, sessionId)).toBe(join(root, "state", "subagent"));
		expect(sessionApiUsagePath(cwd, sessionId)).toBe(join(root, "state", "api-usage.jsonl"));
	});

	it("resolves artifact paths", () => {
		expect(sessionArtifactsDir(cwd, sessionId)).toBe(join(root, "artifacts"));
		expect(sessionPlansDir(cwd, sessionId)).toBe(join(root, "artifacts", "plans"));
		expect(sessionSpecsDir(cwd, sessionId)).toBe(join(root, "artifacts", "specs"));
	});

	it("resolves skill paths", () => {
		expect(sessionSkillsDir(cwd, sessionId)).toBe(join(root, "skills"));
		expect(sessionActiveStatePath(cwd, sessionId)).toBe(join(root, "skills", "active-state.json"));
		expect(skillDir(cwd, "ralplan", sessionId)).toBe(join(root, "skills", "ralplan"));
		expect(skillStatePath(cwd, "ralplan", sessionId)).toBe(join(root, "skills", "ralplan", "state.json"));
		expect(skillExecutionsDir(cwd, "ralplan", sessionId)).toBe(join(root, "skills", "ralplan", "executions"));
	});

	it("rejects unsafe skill segments and encodes opaque mutation ids", () => {
		expect(() => skillDir(cwd, "../ralplan", sessionId)).toThrow("invalid skill");
		expect(sessionTransactionPath(cwd, sessionId, "handoff:2026-08-13T13:21:12.921Z")).toBe(
			join(root, "state", "transactions", "handoff%3A2026-08-13T13%3A21%3A12%2E921Z.json"),
		);
	});
});
