/**
 * Report finding tool — intermediate progress reporting for detached subagents.
 *
 * Publishes structured findings without completing the task. The parent session
 * can inspect these findings while the subagent continues working. Useful for
 * long-running detached subagents that need to surface intermediate results.
 *
 * Aligned with gajae-code's `report_finding` tool but Pi-native: simpler
 * schema, findings stored on the SubagentManager for parent retrieval.
 */
import type { AgentToolResult } from "@tsuuanmi/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../../api/types.ts";

export interface ReportFindingDetails {
	findings: string;
	summary?: string;
}

const reportFindingSchema = Type.Object({
	findings: Type.String({
		description:
			"Structured findings to report to the parent. Include key details, decisions, or results discovered so far.",
	}),
	summary: Type.Optional(Type.String({ description: "One-line summary of the findings for quick scanning." })),
});

export function createReportFindingToolDefinition(): ToolDefinition<typeof reportFindingSchema, ReportFindingDetails> {
	return {
		name: "report_finding",
		label: "Report Finding",
		description:
			"Report intermediate findings to the parent session without completing the task. " +
			"Use for long-running subagents that need to surface results as they are discovered. " +
			"The task continues after calling this tool — call `yield` to finish.",
		parameters: reportFindingSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<ReportFindingDetails>> => {
			const p = params as Static<typeof reportFindingSchema>;
			return {
				content: [
					{
						type: "text",
						text: p.summary ? `Finding reported: ${p.summary}` : "Finding reported.",
					},
				],
				details: { findings: p.findings, summary: p.summary },
			};
		},
	};
}
