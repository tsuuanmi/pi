// Architecture adapted from open-multi-agent (MIT).

import { Task, TaskQueue } from "#agent/task/task";
import type { TaskInput } from "#agent/task/types";
import type { Team } from "#agent/team/team";
import { executeTask } from "./execution/executor.js";
import {
	approveTaskDispatch,
	assertKnownAssignees,
	assertTeamCanRun,
	blockUnreachableTasks,
	skipPendingTasks,
} from "./execution/governance.js";
import { planTasks } from "./planning/planner.js";
import { routeReadyTasks } from "./routing/routing.js";
import { Scheduler } from "./routing/scheduler.js";
import { resolveRunBudget } from "./runtime/budget.js";
import { normalizeCheckpoint, type OrchestratorCheckpoint } from "./runtime/checkpoint.js";
import { createRunContext } from "./runtime/context.js";
import { assertResumeFacts, createRunFacts } from "./runtime/facts.js";
import { assertSameRunIdentity, createRunIdentity, normalizeRunIdentity } from "./runtime/identity.js";
import type { OrchestratorConfig, PlanOptions, PlanResult, RunTeamOptions, RunTeamResult } from "./types.js";

export class Orchestrator {
	private readonly scheduler: Scheduler;
	private readonly maxConcurrency: number;
	private readonly onProgress?: OrchestratorConfig["onProgress"];
	private readonly onTaskVerify?: OrchestratorConfig["onTaskVerify"];
	private readonly onTaskConsequential?: OrchestratorConfig["onTaskConsequential"];
	private readonly onTaskFailure?: OrchestratorConfig["onTaskFailure"];
	private readonly runBudget?: OrchestratorConfig["runBudget"];
	private readonly checkpointStore?: OrchestratorConfig["checkpointStore"];
	private readonly runIdentity?: OrchestratorConfig["runIdentity"];

	constructor(config: OrchestratorConfig = {}) {
		this.scheduler = new Scheduler({
			schedulingStrategy: config.schedulingStrategy,
			schedulingWeights: config.schedulingWeights,
		});
		this.maxConcurrency = config.maxConcurrency ?? 4;
		this.onProgress = config.onProgress;
		this.onTaskVerify = config.onTaskVerify;
		this.onTaskConsequential = config.onTaskConsequential;
		this.onTaskFailure = config.onTaskFailure;
		this.runBudget = resolveRunBudget(config.runBudget);
		this.checkpointStore = config.checkpointStore;
		this.runIdentity = config.runIdentity ? normalizeRunIdentity(config.runIdentity) : undefined;
	}

	async plan(team: Team, goal: string, options: PlanOptions): Promise<PlanResult> {
		assertTeamCanRun(team);
		return planTasks(team, goal, options);
	}

	async run(team: Team, tasks: readonly (Task | TaskInput)[], options: RunTeamOptions = {}): Promise<RunTeamResult> {
		assertTeamCanRun(team);
		const checkpoint = await loadCheckpoint(this.checkpointStore ?? options.checkpointStore);
		const runIdentity = resolveRunIdentity(checkpoint, options.runIdentity ?? this.runIdentity);
		const queue = checkpoint ? TaskQueue.fromSnapshot(checkpoint.tasks, { resetInProgress: true }) : new TaskQueue();
		if (!checkpoint) queue.addBatch(tasks);
		const runFacts = resolveRunFacts(team, tasks, queue, checkpoint);
		assertKnownAssignees(queue, team);
		const normalizedRunBudget = resolveRunBudget(options.runBudget ?? this.runBudget);
		const context = createRunContext({
			team,
			queue,
			options,
			scheduler: this.scheduler,
			runIdentity,
			runFacts,
			defaultMaxConcurrency: this.maxConcurrency,
			defaultOnProgress: this.onProgress,
			defaultOnTaskVerify: this.onTaskVerify,
			defaultOnTaskConsequential: this.onTaskConsequential,
			defaultOnTaskFailure: this.onTaskFailure,
			checkpointStore: options.checkpointStore ?? this.checkpointStore,
			runBudget: normalizedRunBudget,
			initialMetrics: checkpoint?.metrics,
			initialReceipts: checkpoint?.receipts,
			initialTaskStarts: checkpoint?.taskStarts,
		});

		context.emitTrace({ type: "run_start", runStatus: "running", data: { taskCount: queue.list().length } });
		await context.saveCheckpoint("running");
		if (context.aborted) {
			context.abort(context.abortedReason ?? "Run aborted.");
			skipPendingTasks(queue, context, context.abortedReason ?? "Run aborted.");
		} else {
			await this.runLoop(context);
		}

		if (context.aborted) {
			skipPendingTasks(queue, context, context.abortedReason ?? "Run aborted.");
		} else {
			queue.blockImpossible();
			blockUnreachableTasks(queue);
		}

		const snapshots = queue.snapshots();
		const failed = snapshots.filter(
			(task) => task.status === "failed" || task.status === "blocked" || task.status === "skipped",
		);
		const status = context.aborted ? "aborted" : "completed";
		await context.saveCheckpoint(status);
		context.emitTrace({
			type: status === "aborted" ? "run_abort" : "run_complete",
			runStatus: status,
			...(context.abortedReason ? { message: context.abortedReason } : {}),
			data: { success: status === "completed" && failed.length === 0, taskCount: snapshots.length },
		});
		const result = {
			status,
			success: status === "completed" && failed.length === 0,
			...(context.abortedReason ? { abortedReason: context.abortedReason } : {}),
			runIdentity,
			runFacts,
			tasks: snapshots,
			metrics: context.metricsSnapshot(),
			receipts: context.receiptsSnapshot(),
			output: snapshots
				.filter((task) => task.status === "completed")
				.map((task) => task.result ?? "")
				.join("\n\n"),
		} satisfies RunTeamResult;
		context.dispose();
		return result;
	}

	private async runLoop(context: ReturnType<typeof createRunContext>): Promise<void> {
		while (true) {
			if (context.aborted) return;
			context.queue.blockImpossible();
			let stopDispatch = false;
			while (!stopDispatch && context.inFlight.size < context.maxConcurrency) {
				const ready = routeReadyTasks({
					scheduler: context.scheduler,
					readyTasks: context.queue.ready(),
					allTasks: context.queue.snapshots(),
					agents: context.team.getAgents(),
					options: context.options,
				});
				const routed = ready.find(({ task }) => !context.inFlight.has(task.id));
				if (!routed) break;
				const next = routed.task;
				context.recordRoutingDecision(routed.decision);
				context.emitTrace({
					type: "routing_decision",
					runStatus: context.aborted ? "aborted" : "running",
					taskId: routed.decision.taskId,
					taskTitle: routed.decision.taskTitle,
					agent: routed.decision.agent,
					data: routed.decision,
				});
				if (!(await approveTaskDispatch(next, context))) {
					stopDispatch = true;
					break;
				}
				const promise = executeTask(next, context.queue, context).finally(() => {
					context.inFlight.delete(next.id);
				});
				context.inFlight.set(next.id, promise);
			}
			if (stopDispatch) {
				if (context.inFlight.size > 0) await Promise.allSettled(context.inFlight.values());
				return;
			}
			if (context.inFlight.size === 0) break;
			await Promise.race(context.inFlight.values());
		}
	}
}

function resolveRunIdentity(
	checkpoint: OrchestratorCheckpoint | undefined,
	requested: OrchestratorConfig["runIdentity"] | RunTeamOptions["runIdentity"] | undefined,
) {
	if (!checkpoint) return createRunIdentity(requested);
	if (requested) assertSameRunIdentity(checkpoint.runIdentity, normalizeRunIdentity(requested));
	return checkpoint.runIdentity;
}

function resolveRunFacts(
	team: Team,
	tasks: readonly (Task | TaskInput)[],
	queue: TaskQueue,
	checkpoint: OrchestratorCheckpoint | undefined,
) {
	if (!checkpoint) return createRunFacts(team, queue.snapshots());
	const requestedFacts = createRunFacts(team, tasks.map(taskIdReference), checkpoint.runFacts.startedAt);
	assertResumeFacts(checkpoint.runFacts, requestedFacts);
	return checkpoint.runFacts;
}

function taskIdReference(task: Task | TaskInput): { id: string } {
	return task instanceof Task ? { id: task.id } : { id: task.id ?? "" };
}

async function loadCheckpoint(
	checkpointStore: OrchestratorConfig["checkpointStore"] | RunTeamOptions["checkpointStore"] | undefined,
) {
	if (!checkpointStore) return undefined;
	const checkpoint = await checkpointStore.load();
	if (!checkpoint) return undefined;
	const normalized = normalizeCheckpoint(checkpoint);
	if (normalized.status !== "running") {
		throw new Error(`Cannot resume orchestrator from ${normalized.status} checkpoint.`);
	}
	return normalized;
}
