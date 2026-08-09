import type { AgentLoopConfig } from "#agent/config";
import type { TraceSpan, TraceStatus } from "#agent/messages/state";

export function getNow(config: AgentLoopConfig): () => number {
	return config.now ?? Date.now;
}

export function createTraceSpan(
	kind: "request" | "tool",
	id: string,
	name: string | undefined,
	startedAt: number,
	endedAt: number,
	status: TraceStatus,
): TraceSpan {
	return {
		kind,
		id,
		name,
		startedAt,
		endedAt,
		durationMs: endedAt - startedAt,
		status,
	};
}
