/**
 * Yield tool — structured completion for subagents.
 *
 * Subagents call this tool to finish and return structured JSON output.
 * The parent SubagentManager extracts the yield result from the tool details
 * to populate `result_text` with structured data instead of raw assistant text.
 *
 * Aligned with gajae-code's `YieldTool` but Pi-native: simpler schema
 * validation (accepts any JSON object as data), no JTD schema processing.
 */
import type { AgentToolResult } from "@tsuuanmi/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../../../../api/types.ts";
import type { YieldDetails } from "../../../../core/subagents/yield-result.ts";

const yieldSchema = Type.Object({
	result: Type.Union([
		Type.Object({
			data: Type.Any({ description: "Structured result data for successful completion." }),
		}),
		Type.Object({
			error: Type.String({ description: "Error message for failed completion." }),
		}),
	]),
});

export function createYieldToolDefinition(): ToolDefinition<typeof yieldSchema, YieldDetails> {
	return {
		name: "yield",
		label: "Submit Result",
		description:
			"Finish the task with structured JSON output. Call exactly once at the end of the task.\n\n" +
			'Pass `result: { data: <your output> }` for success, or `result: { error: "message" }` for failure.\n' +
			"The `data`/`error` wrapper is required — do not put your output directly in `result`.",
		parameters: yieldSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<YieldDetails>> => {
			const raw = params as Static<typeof yieldSchema>;
			const result = raw.result;
			if ("error" in result && typeof result.error === "string") {
				return {
					content: [{ type: "text", text: `Task aborted: ${result.error}` }],
					details: { data: undefined, status: "aborted", error: result.error },
				};
			}
			if ("data" in result) {
				return {
					content: [{ type: "text", text: "Result submitted." }],
					details: { data: result.data, status: "success" },
				};
			}
			throw new Error(
				'result must contain either `data` or `error`. Use `{result: {data: <your output>}}` for success or `{result: {error: "message"}}` for failure.',
			);
		},
	};
}
