type RalplanApprovalTarget = "ultragoal" | "team" | "stop";

export function assertRalplanApprovalTarget(
	value: string | undefined,
): asserts value is RalplanApprovalTarget | undefined {
	if (value === undefined) return;
	if (!["ultragoal", "team", "stop"].includes(value)) {
		throw new Error(`unknown ralplan approval target: ${value}`);
	}
}

export function assertRalplanRole(
	value: string | undefined,
): asserts value is "explorer" | "planner" | "architect" | "critic" | "expert" | undefined {
	if (value === undefined) return;
	if (!["explorer", "planner", "architect", "critic", "expert"].includes(value)) {
		throw new Error(`unknown ralplan agent role: ${value}`);
	}
}
