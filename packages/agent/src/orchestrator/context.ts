import { type BudgetState, initializeBudgetState } from "#agent/orchestrator/budget";
import type { OrchestratorCheckpointStore } from "#agent/orchestrator/checkpoint";
import type { Scheduler } from "#agent/orchestrator/scheduler";
import type {
	OrchestratorEvent,
	OrchestratorTraceEvent,
	RunBudget,
	RunTeamOptions,
	TaskExecutionMetrics,
	TaskFailureAction,
	TaskFailureContext,
	TaskVerificationContext,
} from "#agent/orchestrator/types";
import type { TaskQueue } from "#agent/task/task";
import type { TaskSnapshot } from "#agent/task/types";
import type { Team } from "#agent/team/team";

export interface CreateRunContextInput {
	team: Team;
	queue: TaskQueue;
	options: RunTeamOptions;
	scheduler: Scheduler;
	defaultMaxConcurrency: number;
	defaultOnProgress?: (event: OrchestratorEvent) => void;
	defaultOnTrace?: (event: OrchestratorTraceEvent) => void;
	defaultOnTaskVerify?: (context: TaskVerificationContext) => boolean | Promise<boolean>;
	defaultOnTaskFailure?: (context: TaskFailureContext) => TaskFailureAction | Promise<TaskFailureAction>;
	checkpointStore?: OrchestratorCheckpointStore;
	runBudget?: RunBudget;
	initialMetrics?: Readonly<Record<string, TaskExecutionMetrics>>;
	initialTaskStarts?: number;
}

export class OrchestratorRunContext {
	readonly team: Team;
	readonly queue: TaskQueue;
	readonly options: RunTeamOptions;
	readonly scheduler: Scheduler;
	readonly maxConcurrency: number;
	readonly inFlight = new Map<string, Promise<void>>();
	readonly checkpointStore?: OrchestratorCheckpointStore;
	readonly runBudget?: RunBudget;
	readonly budget: BudgetState;
	readonly executionSignal?: AbortSignal;

	private readonly defaultOnProgress?: (event: OrchestratorEvent) => void;
	readonly defaultOnTrace?: (event: OrchestratorTraceEvent) => void;
	readonly defaultOnTaskVerify?: (context: TaskVerificationContext) => boolean | Promise<boolean>;
	readonly defaultOnTaskFailure?: (context: TaskFailureContext) => TaskFailureAction | Promise<TaskFailureAction>;
	private readonly metrics = new Map<string, TaskExecutionMetrics>();
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
		this.maxConcurrency = resolveMaxConcurrency(input.defaultMaxConcurrency, input.options.maxConcurrency);
		this.defaultOnProgress = input.defaultOnProgress;
		this.defaultOnTrace = input.options.onTrace ?? input.defaultOnTrace;
		this.defaultOnTaskVerify = input.options.onTaskVerify ?? input.defaultOnTaskVerify;
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
		const timestamped = { ...event, timestamp: new Date().toISOString() } satisfies OrchestratorEvent;
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
		const timestamped = { ...event, timestamp: new Date().toISOString() } satisfies OrchestratorTraceEvent;
		this.options.onTrace?.(timestamped);
		if (this.defaultOnTrace !== this.options.onTrace) this.defaultOnTrace?.(timestamped);
	}

	recordTaskMetrics(task: TaskSnapshot, startedAtMs: number, completedAtMs: number): void {
		this.metrics.set(task.id, {
			startedAt: new Date(startedAtMs).toISOString(),
			completedAt: new Date(completedAtMs).toISOString(),
			durationMs: Math.max(0, completedAtMs - startedAtMs),
			attempts: task.attempts,
			retries: Math.max(0, task.attempts - 1),
		});
	}

	metricsSnapshot(): Readonly<Record<string, TaskExecutionMetrics>> {
		return Object.freeze(Object.fromEntries(this.metrics));
	}

	async saveCheckpoint(status: "running" | "completed" | "aborted"): Promise<void> {
		if (!this.checkpointStore) return;
		const checkpoint = {
			version: 1 as const,
			status,
			tasks: this.queue.snapshot(),
			metrics: this.metricsSnapshot(),
			taskStarts: this.budget.taskStarts,
			updatedAt: new Date().toISOString(),
			...(this.abortedReason ? { abortedReason: this.abortedReason } : {}),
		};
		this.checkpointWrite = this.checkpointWrite.then(async () => {
			await this.checkpointStore?.save(checkpoint);
		});
		this.emitTrace({
			type: "checkpoint_save",
			runStatus: status,
			message: this.abortedReason,
			data: checkpoint,
		});
		await this.checkpointWrite;
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
