import type { TaskQueue } from "#agent/task/task";
import type { TaskSnapshot } from "#agent/task/types";
import type { Team } from "#agent/team/team";
import type { TaskRoutingDecision } from "../routing/routing.js";
import type { Scheduler } from "../routing/scheduler.js";
import type {
	OrchestratorEvent,
	OrchestratorTraceEvent,
	RunBudget,
	RunTeamOptions,
	TaskExecutionMetrics,
	TaskFailureAction,
	TaskFailureContext,
	TaskRetryClassification,
	TaskVerificationContext,
} from "../types.js";
import { type BudgetState, initializeBudgetState } from "./budget.js";
import type { OrchestratorCheckpointStore } from "./checkpoint.js";
import type { RunFacts } from "./facts.js";
import type { RunIdentity } from "./identity.js";
import { createTaskExecutionReceipt, type TaskConsequentialReceipt, type TaskExecutionReceipt } from "./receipt.js";

export interface CreateRunContextInput {
	team: Team;
	queue: TaskQueue;
	options: RunTeamOptions;
	scheduler: Scheduler;
	runIdentity: RunIdentity;
	runFacts: RunFacts;
	defaultMaxConcurrency: number;
	defaultOnProgress?: (event: OrchestratorEvent) => void;
	defaultOnTrace?: (event: OrchestratorTraceEvent) => void;
	defaultOnTaskVerify?: (context: TaskVerificationContext) => boolean | Promise<boolean>;
	defaultOnTaskConsequential?: (task: Readonly<TaskSnapshot>) => boolean | Promise<boolean>;
	defaultOnTaskRetryClassify?: (
		context: TaskFailureContext,
	) => TaskRetryClassification | Promise<TaskRetryClassification>;
	defaultOnTaskFailure?: (context: TaskFailureContext) => TaskFailureAction | Promise<TaskFailureAction>;
	checkpointStore?: OrchestratorCheckpointStore;
	runBudget?: RunBudget;
	initialMetrics?: Readonly<Record<string, TaskExecutionMetrics>>;
	initialReceipts?: Readonly<Record<string, TaskExecutionReceipt>>;
	initialTaskStarts?: number;
}

export class OrchestratorRunContext {
	readonly team: Team;
	readonly queue: TaskQueue;
	readonly options: RunTeamOptions;
	readonly scheduler: Scheduler;
	readonly runIdentity: RunIdentity;
	readonly runFacts: RunFacts;
	readonly maxConcurrency: number;
	readonly inFlight = new Map<string, Promise<void>>();
	readonly checkpointStore?: OrchestratorCheckpointStore;
	readonly runBudget?: RunBudget;
	readonly budget: BudgetState;
	readonly executionSignal?: AbortSignal;

	private readonly defaultOnProgress?: (event: OrchestratorEvent) => void;
	readonly defaultOnTrace?: (event: OrchestratorTraceEvent) => void;
	readonly defaultOnTaskVerify?: (context: TaskVerificationContext) => boolean | Promise<boolean>;
	readonly defaultOnTaskConsequential?: (task: Readonly<TaskSnapshot>) => boolean | Promise<boolean>;
	readonly defaultOnTaskRetryClassify?: (
		context: TaskFailureContext,
	) => TaskRetryClassification | Promise<TaskRetryClassification>;
	readonly defaultOnTaskFailure?: (context: TaskFailureContext) => TaskFailureAction | Promise<TaskFailureAction>;
	private readonly metrics = new Map<string, TaskExecutionMetrics>();
	private readonly receipts = new Map<string, TaskExecutionReceipt>();
	private readonly routingDecisions = new Map<string, TaskRoutingDecision>();
	private readonly verificationResults = new Map<string, boolean>();
	private readonly consequentialResults = new Map<string, TaskConsequentialReceipt>();
	private readonly retryClassifications = new Map<string, TaskRetryClassification>();
	private checkpointWrite: Promise<void> = Promise.resolve();
	private abortMessage?: string;
	private budgetTimer?: ReturnType<typeof setTimeout>;
	private readonly budgetController?: AbortController;
	private readonly onCallerAbort?: () => void;

	constructor(input: CreateRunContextInput) {
		this.team = input.team;
		this.queue = input.queue;
		this.options = input.options;
		this.scheduler = input.scheduler;
		this.runIdentity = input.runIdentity;
		this.runFacts = input.runFacts;
		this.maxConcurrency = resolveMaxConcurrency(input.defaultMaxConcurrency, input.options.maxConcurrency);
		this.defaultOnProgress = input.defaultOnProgress;
		this.defaultOnTrace = input.options.onTrace ?? input.defaultOnTrace;
		this.defaultOnTaskVerify = input.options.onTaskVerify ?? input.defaultOnTaskVerify;
		this.defaultOnTaskConsequential = input.options.onTaskConsequential ?? input.defaultOnTaskConsequential;
		this.defaultOnTaskRetryClassify = input.options.onTaskRetryClassify ?? input.defaultOnTaskRetryClassify;
		this.defaultOnTaskFailure = input.options.onTaskFailure ?? input.defaultOnTaskFailure;
		this.checkpointStore = input.options.checkpointStore ?? input.checkpointStore;
		this.runBudget = input.options.runBudget ?? input.runBudget;
		this.budget = initializeBudgetState(input.initialTaskStarts ?? 0);
		if (this.runBudget?.maxRunMs !== undefined) {
			this.budgetController = new AbortController();
			this.executionSignal = this.budgetController.signal;
			this.budgetTimer = setTimeout(() => this.abortForRunBudget(), this.runBudget.maxRunMs);
			if (input.options.abortSignal) {
				this.onCallerAbort = () => this.budgetController?.abort();
				input.options.abortSignal.addEventListener("abort", this.onCallerAbort, { once: true });
			}
		} else {
			this.executionSignal = input.options.abortSignal;
		}
		for (const [taskId, metrics] of Object.entries(input.initialMetrics ?? {})) {
			this.metrics.set(taskId, metrics);
		}
		for (const [taskId, receipt] of Object.entries(input.initialReceipts ?? {})) {
			this.receipts.set(taskId, receipt);
			if (receipt.retryClassification !== undefined)
				this.retryClassifications.set(taskId, receipt.retryClassification);
		}
	}

	get aborted(): boolean {
		return (
			this.abortMessage !== undefined ||
			this.options.abortSignal?.aborted === true ||
			this.budgetController?.signal.aborted === true
		);
	}

	get abortedReason(): string | undefined {
		if (this.abortMessage) return this.abortMessage;
		return this.options.abortSignal?.aborted === true ? "Run aborted by abort signal." : undefined;
	}

	get taskStarts(): number {
		return this.budget.taskStarts;
	}

	recordTaskStart(): void {
		this.budget.taskStarts += 1;
	}

	abort(message: string): void {
		this.abortMessage ??= message;
		this.budgetController?.abort();
	}

	dispose(): void {
		if (this.budgetTimer) clearTimeout(this.budgetTimer);
		if (this.onCallerAbort && this.options.abortSignal) {
			this.options.abortSignal.removeEventListener("abort", this.onCallerAbort);
		}
	}

	emit(event: Omit<OrchestratorEvent, "timestamp">): void {
		const timestamped = {
			...event,
			timestamp: new Date().toISOString(),
			runIdentity: this.runIdentity,
		} satisfies OrchestratorEvent;
		this.options.onProgress?.(timestamped);
		if (this.defaultOnProgress !== this.options.onProgress) this.defaultOnProgress?.(timestamped);
	}

	private abortForRunBudget(): void {
		const message = `Run budget exceeded: maxRunMs=${this.runBudget?.maxRunMs ?? 0}.`;
		this.abortMessage ??= message;
		this.budgetController?.abort();
		this.emit({
			type: "budget_exceeded",
			message,
			data: this.budget,
		});
		this.emitTrace({
			type: "budget_exceeded",
			runStatus: "aborted",
			message,
			data: this.budget,
		});
	}

	emitTrace(event: Omit<OrchestratorTraceEvent, "timestamp">): void {
		const timestamped = {
			...event,
			timestamp: new Date().toISOString(),
			runIdentity: this.runIdentity,
		} satisfies OrchestratorTraceEvent;
		this.options.onTrace?.(timestamped);
		if (this.defaultOnTrace !== this.options.onTrace) this.defaultOnTrace?.(timestamped);
	}

	recordRoutingDecision(decision: TaskRoutingDecision): void {
		this.routingDecisions.set(decision.taskId, decision);
	}

	recordTaskVerification(taskId: string, approved: boolean): void {
		this.verificationResults.set(taskId, approved);
	}

	recordTaskConsequential(taskId: string, receipt: TaskConsequentialReceipt): void {
		this.consequentialResults.set(taskId, receipt);
	}

	recordTaskRetryClassification(
		task: TaskSnapshot,
		startedAtMs: number,
		completedAtMs: number,
		classification: TaskRetryClassification,
	): void {
		this.retryClassifications.set(task.id, classification);
		this.receipts.set(
			task.id,
			createTaskExecutionReceipt({
				runId: this.runIdentity.runId,
				task,
				startedAtMs,
				completedAtMs,
				routing: this.routingDecisions.get(task.id),
				retryClassification: classification,
				verified: this.verificationResults.get(task.id),
				consequential: this.consequentialResults.get(task.id),
			}),
		);
	}

	recordTaskMetrics(task: TaskSnapshot, startedAtMs: number, completedAtMs: number): void {
		this.metrics.set(task.id, {
			startedAt: new Date(startedAtMs).toISOString(),
			completedAt: new Date(completedAtMs).toISOString(),
			durationMs: Math.max(0, completedAtMs - startedAtMs),
			attempts: task.attempts,
			retries: Math.max(0, task.attempts - 1),
		});
		this.receipts.set(
			task.id,
			createTaskExecutionReceipt({
				runId: this.runIdentity.runId,
				task,
				startedAtMs,
				completedAtMs,
				routing: this.routingDecisions.get(task.id),
				retryClassification: this.retryClassifications.get(task.id),
				verified: this.verificationResults.get(task.id),
				consequential: this.consequentialResults.get(task.id),
			}),
		);
	}

	metricsSnapshot(): Readonly<Record<string, TaskExecutionMetrics>> {
		return Object.freeze(Object.fromEntries(this.metrics));
	}

	receiptsSnapshot(): Readonly<Record<string, TaskExecutionReceipt>> {
		return Object.freeze(Object.fromEntries(this.receipts));
	}

	async saveCheckpoint(status: "running" | "completed" | "aborted"): Promise<void> {
		if (!this.checkpointStore) return;
		const checkpoint = {
			version: 4 as const,
			status,
			runIdentity: this.runIdentity,
			runFacts: this.runFacts,
			tasks: this.queue.snapshot(),
			metrics: this.metricsSnapshot(),
			receipts: this.receiptsSnapshot(),
			taskStarts: this.budget.taskStarts,
			updatedAt: new Date().toISOString(),
			...(this.abortedReason ? { abortedReason: this.abortedReason } : {}),
		};
		const write = this.checkpointWrite.then(async () => {
			await this.checkpointStore?.save(checkpoint);
		});
		this.checkpointWrite = write.catch(() => undefined);
		this.emitTrace({
			type: "checkpoint_save",
			runStatus: status,
			message: this.abortedReason,
			data: checkpoint,
		});
		try {
			await write;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.emit({
				type: "error",
				message: `Checkpoint save failed: ${message}`,
				data: error,
			});
			this.emitTrace({
				type: "checkpoint_save_error",
				runStatus: status,
				message,
				data: error,
			});
			throw error;
		}
	}
}

export function createRunContext(input: CreateRunContextInput): OrchestratorRunContext {
	return new OrchestratorRunContext(input);
}

function resolveMaxConcurrency(defaultMaxConcurrency: number, maxConcurrency?: number): number {
	if (!Number.isFinite(defaultMaxConcurrency) || defaultMaxConcurrency < 1) {
		throw new RangeError("Default maxConcurrency must be a finite number greater than or equal to 1.");
	}
	if (maxConcurrency === undefined) return Math.max(1, Math.floor(defaultMaxConcurrency));
	if (!Number.isFinite(maxConcurrency) || maxConcurrency < 1) {
		throw new RangeError("maxConcurrency must be a finite number greater than or equal to 1.");
	}
	return Math.max(1, Math.floor(maxConcurrency));
}
