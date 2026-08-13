import {
	assertExpectedNextRole,
	assertNoGuardedSpawnOverrides,
	guardedSpawnMetadata,
} from "#workflows/policy/expected-next-role";
import { nextRoleForSkill } from "#workflows/policy/skill-policy";
import { getUltragoalStatus } from "#workflows/skills/ultragoal/plan";
import type { WorkflowExecutionMetadataValue, WorkflowSubagentSpawnInput } from "#workflows/tool/subagent-spawn";

export async function assertUltragoalSubagentSpawn(
	input: WorkflowSubagentSpawnInput,
	cwd: string,
	sessionId: string,
): Promise<boolean> {
	const metadata = readMetadata(input.metadata);
	if (metadata?.workflow !== "ultragoal") return false;
	if (input.systemPrompt === undefined)
		throw new Error("ultragoal subagent_spawn requires caller-defined systemPrompt");
	const status = await getUltragoalStatus(cwd, sessionId);
	const expected = nextRoleForSkill({ skill: "ultragoal", state: status });
	if (!expected) throw new Error("no legal next ultragoal agent spawn");
	assertExpectedNextRole(expected, {
		skill: "ultragoal",
		stage: requiredMetadata(metadata, "stage"),
		role: requiredString(input.role, "role"),
		owner: requiredMetadata(metadata, "owner"),
		taskId: requiredMetadata(metadata, "taskId"),
	});
	assertMetadata(metadata, guardedSpawnMetadata(expected));
	assertNoGuardedSpawnOverrides(input);
	if (input.agent !== "worker") throw new Error("ultragoal goal execution requires agent profile worker");
	return true;
}

function readMetadata(value: unknown): Record<string, WorkflowExecutionMetadataValue> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, WorkflowExecutionMetadataValue>)
		: undefined;
}

function assertMetadata(
	actual: Record<string, WorkflowExecutionMetadataValue>,
	expected: Record<string, string>,
): void {
	for (const [key, value] of Object.entries(expected)) {
		if (actual[key] !== value) throw new Error(`subagent_spawn metadata ${key} must be ${value}`);
	}
}

function requiredMetadata(metadata: Record<string, WorkflowExecutionMetadataValue>, field: string): string {
	return requiredString(metadata[field], `metadata.${field}`);
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
		throw new Error(`${field} must be a non-empty string without surrounding whitespace`);
	}
	return value;
}
