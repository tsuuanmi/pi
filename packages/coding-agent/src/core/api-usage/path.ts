import { join } from "node:path";
import { piSessionRoot } from "#coding-agent/core/session/session-layout";

export function apiUsageLogPath(cwd: string, sessionId: string): string | undefined {
	const trimmed = sessionId.trim();
	if (!trimmed) return undefined;
	return join(piSessionRoot(cwd, trimmed), "api-usage.jsonl");
}
