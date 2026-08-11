export type DeepInterviewHandoff = "ralplan" | "team" | "ultragoal" | "stop";

export function assertDeepInterviewHandoff(value: string): asserts value is DeepInterviewHandoff {
	if (!["ralplan", "team", "ultragoal", "stop"].includes(value)) {
		throw new Error(`unknown handoff workflow: ${value}`);
	}
}
