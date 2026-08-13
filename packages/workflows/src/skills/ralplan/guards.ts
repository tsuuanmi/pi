type RalplanApprovalTarget = "ultragoal" | "team" | "stop";

export function assertRalplanApprovalTarget(
	value: string | undefined,
): asserts value is RalplanApprovalTarget | undefined {
	if (value === undefined) return;
	if (!["ultragoal", "team", "stop"].includes(value)) {
		throw new Error(`unknown ralplan approval target: ${value}`);
	}
}
