import type { WorkflowHudChip, WorkflowHudSeverity } from "../state/active-state.ts";

export function hudChip(
	label: string,
	value?: string | number | boolean,
	priority?: number,
	severity?: WorkflowHudSeverity,
): WorkflowHudChip {
	return {
		label,
		...(value !== undefined ? { value: String(value) } : {}),
		...(priority !== undefined ? { priority } : {}),
		...(severity ? { severity } : {}),
	};
}

export function progressChip(done: number, total: number, priority = 25): WorkflowHudChip {
	return hudChip("progress", `${done}/${total}`, priority);
}

export function shipWithCaveatsChip(caveats: number | string = "yes", priority = 45): WorkflowHudChip {
	return hudChip("ship", `caveats:${caveats}`, priority, "warning");
}

export function limitationsChip(limitations: number | string, priority = 50): WorkflowHudChip {
	return hudChip("limitations", limitations, priority, "info");
}

export function escalationToExpertChip(priority = 15): WorkflowHudChip {
	return hudChip("escalation", "expert", priority, "warning");
}
