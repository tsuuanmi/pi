import type { AgentLoopConfig } from "#agent/config";

export type TraceStatus = "ok" | "error" | "aborted" | "timeout" | "blocked";

export interface TraceSpan {
	kind: "request" | "tool";
	id: string;
	name?: string;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	status: TraceStatus;
}

export interface AgentTraceEvent {
	type: "trace";
	name: string;
	timestamp: number;
	details?: Record<string, unknown>;
	span?: TraceSpan;
}

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
