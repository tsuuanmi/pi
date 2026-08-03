export type DeepInterviewHandoff = "ralplan" | "team" | "ultragoal" | "stop";

export function assertDeepInterviewHandoff(
	value: string | undefined,
): asserts value is DeepInterviewHandoff | undefined {
	if (value === undefined) return;
	if (!["ralplan", "team", "ultragoal", "stop"].includes(value)) {
		throw new Error(`unknown handoff workflow: ${value}`);
	}
}
