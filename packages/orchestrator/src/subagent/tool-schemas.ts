import { type Static, Type } from "typebox";

export const subagentSpawnSchema = Type.Object({
	agent: Type.String({
		description:
			"Required agent profile identifier. Must be a registered agent profile loaded by the host (from .agent/agents, .agents/agents, user agents, or enabled package agents such as the bundled workflows profiles).",
	}),
	prompt: Type.String({ description: "User task prompt for the subagent." }),
	model: Type.Optional(Type.String({ description: "Override the selected model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override the selected thinking level." })),
	systemPrompt: Type.Optional(Type.String({ description: "Additional role/system instructions." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for this subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for this subagent." }))),
	persistent: Type.Optional(
		Type.Boolean({ description: "Defaults to the selected profile or true. False uses an in-memory session." }),
	),
	detached: Type.Optional(Type.Boolean({ description: "Return immediately after spawning." })),
	maxDurationMs: Type.Optional(
		Type.Integer({
			description: "Hard wall-clock run-time budget in milliseconds. The subagent fails when exceeded.",
			minimum: 1,
			maximum: Number.MAX_SAFE_INTEGER,
		}),
	),
	label: Type.Optional(Type.String({ description: "Human-readable subagent label." })),
});
export type SubagentSpawnInput = Static<typeof subagentSpawnSchema>;

export const subagentIdSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
export type SubagentIdInput = Static<typeof subagentIdSchema>;

export const subagentStatusSchema = Type.Object({
	id: Type.Optional(Type.String({ description: "Subagent id. Omit to list recent records." })),
	limit: Type.Optional(Type.Number({ description: "Maximum records when listing. Defaults to 10." })),
	verbosity: Type.Optional(
		Type.String({
			description: "Output verbosity: receipt (default, truncated), preview (<=2000 chars), or full (requires id).",
		}),
	),
});
export type SubagentStatusInput = Static<typeof subagentStatusSchema>;

export const subagentAwaitSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	timeoutMs: Type.Optional(
		Type.Number({ description: "Await timeout in milliseconds. Returns reason=timeout when exceeded." }),
	),
	verbosity: Type.Optional(
		Type.String({ description: "Output verbosity: receipt (default, truncated), preview (<=2000 chars), or full." }),
	),
});
export type SubagentAwaitInput = Static<typeof subagentAwaitSchema>;

export const subagentResumeSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	message: Type.String({ description: "Follow-up message to resume the saved subagent context." }),
	maxDurationMs: Type.Optional(
		Type.Integer({
			description: "Hard wall-clock budget for this resumed run. Defaults to the stored budget.",
			minimum: 1,
			maximum: Number.MAX_SAFE_INTEGER,
		}),
	),
});
export type SubagentResumeInput = Static<typeof subagentResumeSchema>;

export const subagentSteerSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	message: Type.String({ description: "Steering message to inject into the live subagent." }),
	delivery: Type.Optional(Type.String({ description: "steer (default) or followUp delivery mode." })),
});
export type SubagentSteerInput = Static<typeof subagentSteerSchema>;

export const subagentPauseSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
export type SubagentPauseInput = Static<typeof subagentPauseSchema>;
