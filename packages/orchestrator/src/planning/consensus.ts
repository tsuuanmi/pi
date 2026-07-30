import type {
	ConsensusResult,
	ConsensusVerifierOptions,
	ConsensusVote,
	TaskVerificationContext,
} from "#orchestrator/types";

export function createConsensusVerifier(
	options: ConsensusVerifierOptions,
): (context: TaskVerificationContext) => Promise<boolean> {
	validateConsensusOptions(options);
	return async (context) => {
		const result = await runConsensusVerification(context, options);
		return result.approved;
	};
}

export async function runConsensusVerification(
	context: TaskVerificationContext,
	options: ConsensusVerifierOptions,
): Promise<ConsensusResult> {
	validateConsensusOptions(options);
	options.onTrace?.({
		type: "consensus_start",
		timestamp: new Date().toISOString(),
		taskId: context.task.id,
		taskTitle: context.task.title,
		message: `Starting consensus verification with ${options.judges.length} judge(s).`,
		data: { minApprovals: options.minApprovals },
	});
	const votes: ConsensusVote[] = [];
	for (const judge of options.judges) {
		let vote: ConsensusVote;
		try {
			const result = await judge.run(buildJudgePrompt(context), {
				signal: options.abortSignal,
				metadata: { phase: "orchestrator-consensus", taskId: context.task.id, judge: judge.name },
			});
			if (!result.success) throw new Error(formatJudgeFailure(result.error, result.output));
			vote = parseJudgeVote(judge.name, result.output);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			options.onTrace?.({
				type: "consensus_error",
				timestamp: new Date().toISOString(),
				taskId: context.task.id,
				taskTitle: context.task.title,
				agent: judge.name,
				message,
				data: error,
			});
			throw error;
		}
		votes.push(vote);
		options.onTrace?.({
			type: "consensus_vote",
			timestamp: new Date().toISOString(),
			taskId: context.task.id,
			taskTitle: context.task.title,
			agent: judge.name,
			message: vote.reason,
			data: vote,
		});
	}
	const approvals = votes.filter((vote) => vote.approved).length;
	const rejections = votes.length - approvals;
	const result: ConsensusResult = {
		approved: approvals >= options.minApprovals,
		votes: Object.freeze([...votes]),
		approvals,
		rejections,
	};
	options.onTrace?.({
		type: "consensus_complete",
		timestamp: new Date().toISOString(),
		taskId: context.task.id,
		taskTitle: context.task.title,
		message: result.approved ? "Consensus verification passed." : "Consensus verification failed.",
		data: result,
	});
	return result;
}

function validateConsensusOptions(options: ConsensusVerifierOptions): void {
	if (!Array.isArray(options.judges) || options.judges.length === 0) {
		throw new Error("Consensus verification requires at least one judge.");
	}
	if (
		!Number.isInteger(options.minApprovals) ||
		options.minApprovals < 1 ||
		options.minApprovals > options.judges.length
	) {
		throw new Error(`Consensus minApprovals must be an integer between 1 and ${options.judges.length}.`);
	}
	const names = new Set<string>();
	for (const judge of options.judges) {
		if (names.has(judge.name)) throw new Error(`Consensus judge names must be unique: ${judge.name}`);
		names.add(judge.name);
	}
}

function buildJudgePrompt(context: TaskVerificationContext): string {
	const dependencies = context.completedDependencies.length
		? context.completedDependencies.map((dependency) => `- ${dependency.id}: ${dependency.result ?? ""}`).join("\n")
		: "None";
	return [
		"You are a strict consensus judge.",
		'Return ONLY JSON with this exact shape: {"approved": boolean, "reason": string}.',
		"Do not return prose, markdown, or extra fields.",
		"",
		`Task ID: ${context.task.id}`,
		`Task title: ${context.task.title}`,
		`Task description: ${context.task.description}`,
		`Worker agent: ${context.agent}`,
		"",
		"Verification metadata:",
		JSON.stringify(context.task.verify ?? {}, null, 2),
		"",
		"Completed dependencies:",
		dependencies,
		"",
		"Output:",
		context.output,
		"",
		"Structured output:",
		JSON.stringify(context.structured ?? null, null, 2),
	].join("\n");
}

function parseJudgeVote(judge: string, rawOutput: string): ConsensusVote {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawOutput.trim());
	} catch (error) {
		throw new Error(
			`Consensus judge "${judge}" returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`Consensus judge "${judge}" must return a JSON object.`);
	}
	const record = parsed as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	if (keys.length !== 2 || keys[0] !== "approved" || keys[1] !== "reason") {
		throw new Error(`Consensus judge "${judge}" must return exactly approved and reason fields.`);
	}
	if (typeof record.approved !== "boolean") {
		throw new Error(`Consensus judge "${judge}" approved field must be boolean.`);
	}
	if (typeof record.reason !== "string") {
		throw new Error(`Consensus judge "${judge}" reason field must be string.`);
	}
	return Object.freeze({
		judge,
		approved: record.approved,
		reason: record.reason,
		rawOutput,
	});
}

function formatJudgeFailure(error: unknown, output: string): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string" && error.length > 0) return error;
	return output || String(error);
}
