import { validateTaskMetadata } from "#orchestrator/task/metadata";
import { formatRequirements } from "#orchestrator/task/requirements";
import type { DependencyPayload, TaskSnapshot } from "#orchestrator/task/types";

const MAX_BLOCK_LENGTH = 12_000;

export interface FormatTaskPromptOptions {
	task: TaskSnapshot;
	completedDependencies: readonly TaskSnapshot[];
}

export function formatTaskPrompt({ task, completedDependencies }: FormatTaskPromptOptions): string {
	const payload = task.dependencyPayload ?? "output";
	const dependencies = completedDependencies.length
		? completedDependencies.map((dependency) => formatDependency(dependency, payload)).join("\n")
		: "None";
	const metadata = task.metadata ? `Metadata:\n${stringify(validateTaskMetadata(task.metadata))}` : "";
	const requirements = formatRequirements(task.requires);
	const requirementBlock = requirements.length > 0 ? `Requirements:\n- ${requirements.join("\n- ")}` : "";
	return [
		...formatHeader(task),
		"",
		"Description:",
		truncate(task.description),
		metadata,
		requirementBlock,
		"",
		"Completed dependencies:",
		dependencies,
		"",
		"Return the task result clearly and concisely.",
	]
		.filter((part) => part.length > 0)
		.join("\n");
}

function formatDependency(dependency: TaskSnapshot, payload: DependencyPayload): string {
	const lines = [`- ${dependency.id}: ${dependency.title}`];
	if (payload === "output" || payload === "both") lines.push(`  Output: ${truncate(dependency.result ?? "")}`);
	if ((payload === "structured" || payload === "both") && dependency.structured !== undefined) {
		lines.push(`  Structured: ${stringify(dependency.structured)}`);
	}
	return lines.join("\n");
}

function formatHeader(task: TaskSnapshot): string[] {
	const lines = [`Task: ${task.title}`];
	if (task.role) lines.push(`Role: ${task.role}`);
	if (task.priority) lines.push(`Priority: ${task.priority}`);
	if (task.memoryScope) lines.push(`Memory scope: ${task.memoryScope}`);
	if (task.attempts > 1) lines.push(`Attempt: ${task.attempts}`);
	return lines;
}

function truncate(value: string): string {
	if (value.length <= MAX_BLOCK_LENGTH) return value;
	return `${value.slice(0, MAX_BLOCK_LENGTH)}\n[truncated ${value.length - MAX_BLOCK_LENGTH} characters]`;
}

function stringify(value: unknown): string {
	try {
		return truncate(JSON.stringify(value, null, 2));
	} catch {
		return "[unserializable value]";
	}
}
