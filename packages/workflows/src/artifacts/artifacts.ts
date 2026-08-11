import { type WorkflowWriteOptions, type WriteArtifactResult, writeTextArtifact } from "#workflows/state/state-writer";

export interface StageArtifactInput {
	path: string;
	content: string;
}

/** Write one deterministic stage artifact through the shared atomic text writer. */
export async function writeStageArtifact(
	input: StageArtifactInput,
	options: WorkflowWriteOptions = {},
): Promise<WriteArtifactResult> {
	return writeTextArtifact(input.path, input.content, options);
}
