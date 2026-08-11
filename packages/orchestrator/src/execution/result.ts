import type { AgentRunResult } from "@tsuuanmi/pi-agent";

export interface TaskResult {
	output: string;
	structured?: unknown;
}

export function toTaskResult(result: AgentRunResult): TaskResult {
	return {
		output: result.output,
		...(result.structured !== undefined ? { structured: result.structured } : {}),
	};
}
