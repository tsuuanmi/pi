import {
	type WorkflowWriteOptions,
	type WriteArtifactResult,
	writeTextArtifact,
} from "#src/harness/shared/state/state-writer";

export interface StageArtifactInput {
	path: string;
	content: string;
}

/**
 * Shared deterministic stage-artifact writer. It intentionally delegates to the
 * existing atomic text writer so package-specific artifact helpers keep their
 * current durability and path-safety behavior.
 */
export async function writeStageArtifact(
	input: StageArtifactInput,
	options: WorkflowWriteOptions = {},
): Promise<WriteArtifactResult> {
	return writeTextArtifact(input.path, input.content, options);
}
