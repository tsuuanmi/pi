import { join } from "node:path";
import { encodePathSegment, piSessionRoot, sessionStateDir } from "#pi/session/root";

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/u;

function requireSafePathSegment(value: string, label: string): string {
	if (!SAFE_PATH_SEGMENT.test(value) || value.includes("..")) {
		throw new Error(`invalid ${label}: ${value}`);
	}
	return value;
}

export { piGlobalRoot, piSessionRoot, sessionStateDir } from "#pi/session/root";

export function sessionAuditPath(cwd: string, sessionId: string): string {
	return join(sessionStateDir(cwd, sessionId), "audit.jsonl");
}

export function sessionTransactionsDir(cwd: string, sessionId: string): string {
	return join(sessionStateDir(cwd, sessionId), "transactions");
}

export function sessionTransactionPath(cwd: string, sessionId: string, mutationId: string): string {
	return join(sessionTransactionsDir(cwd, sessionId), `${encodePathSegment(mutationId)}.json`);
}

export function sessionSubagentDir(cwd: string, sessionId: string): string {
	return join(sessionStateDir(cwd, sessionId), "subagent");
}

export function sessionApiUsagePath(cwd: string, sessionId: string): string {
	return join(sessionStateDir(cwd, sessionId), "api-usage.jsonl");
}

export function sessionArtifactsDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "artifacts");
}

export function sessionPlansDir(cwd: string, sessionId: string): string {
	return join(sessionArtifactsDir(cwd, sessionId), "plans");
}

export function sessionSpecsDir(cwd: string, sessionId: string): string {
	return join(sessionArtifactsDir(cwd, sessionId), "specs");
}

export function sessionSkillsDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "skills");
}

export function sessionActiveStatePath(cwd: string, sessionId: string): string {
	return join(sessionSkillsDir(cwd, sessionId), "active-state.json");
}

export function skillDir(cwd: string, skill: string, sessionId: string): string {
	return join(sessionSkillsDir(cwd, sessionId), requireSafePathSegment(skill, "skill"));
}

export function skillStatePath(cwd: string, skill: string, sessionId: string): string {
	return join(skillDir(cwd, skill, sessionId), "state.json");
}

export function skillExecutionsDir(cwd: string, skill: string, sessionId: string): string {
	return join(skillDir(cwd, skill, sessionId), "executions");
}
