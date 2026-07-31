import type { TSchema } from "typebox";
import type { AgentTool } from "#agent/tool/types";

export function defineTool<TParameters extends TSchema, TDetails = unknown>(
	tool: AgentTool<TParameters, TDetails>,
): AgentTool<TParameters, TDetails> {
	assertText(tool.name, "Tool name is required");
	assertText(tool.description, "Tool description is required");
	assertText(tool.label, "Tool label is required");
	return tool;
}

function assertText(value: unknown, message: string): void {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(message);
	}
}
