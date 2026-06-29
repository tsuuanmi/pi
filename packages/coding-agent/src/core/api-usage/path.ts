import { join } from "node:path";
import { piSessionRoot } from "../session/session-layout.ts";

export function apiUsageLogPath(cwd: string, sessionId: string): string | undefined {
	const trimmed = sessionId.trim();
	if (!trimmed) return undefined;
	return join(piSessionRoot(cwd, trimmed), "api-usage.jsonl");
}
