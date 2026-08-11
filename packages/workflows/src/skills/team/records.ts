import { requiredTrimmedString } from "#workflows/skills/team/fields";
import { assertSafeId } from "#workflows/skills/team/ids";
import type { TeamCompletionEvidence, TeamTask } from "#workflows/skills/team/types";
import { nowIso } from "#workflows/state/state-writer";

function normalizeInputList(value: readonly string[] | undefined, context: string): string[] | undefined {
	if (value === undefined) return undefined;
	const items = value.map((item, index) => requiredTrimmedString(item, `${context}[${index}]`));
	const unique = [...new Set(items)].sort();
	return unique.length > 0 ? unique : undefined;
}

export function createTeamTaskRecord(input: {
	id: string;
	title: string;
	description: string;
	owner?: string;
	depends_on?: readonly string[];
	created_at: string;
	updated_at: string;
}): TeamTask {
	assertSafeId("task_id", input.id);
	const dependsOn = normalizeInputList(input.depends_on, "team task depends_on");
	const title = requiredTrimmedString(input.title, "team task title");
	if (!input.description.trim()) throw new Error("team task description must not be empty");
	return {
		id: input.id,
		title,
		description: input.description,
		status: "pending",
		...(input.owner !== undefined ? { owner: requiredTrimmedString(input.owner, "team task owner") } : {}),
		...(dependsOn !== undefined ? { depends_on: dependsOn } : {}),
		version: 1,
		created_at: input.created_at,
		updated_at: input.updated_at,
	};
}

export function createTeamCompletionEvidence(
	taskId: string,
	input: Omit<TeamCompletionEvidence, "recorded_at">,
	recordedAt = nowIso(),
): TeamCompletionEvidence {
	const summary = input.summary.trim();
	if (summary.length < 16) throw new Error(`invalid completion evidence for ${taskId}: summary is too short`);
	const files = normalizeInputList(input.files, "completion evidence files");
	const verification = normalizeInputList(input.verification, "completion evidence verification");
	return {
		summary,
		...(files !== undefined ? { files } : {}),
		...(verification !== undefined ? { verification } : {}),
		recorded_by: requiredTrimmedString(input.recorded_by, "completion evidence recorded_by"),
		recorded_at: recordedAt,
	};
}
