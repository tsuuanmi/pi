// Architecture adapted from open-multi-agent (MIT).

import { resolveRunBudget } from "#agent/orchestrator/budget";
import { normalizeCheckpoint } from "#agent/orchestrator/checkpoint";
import { createRunContext } from "#agent/orchestrator/context";
import { executeTask } from "#agent/orchestrator/executor";
import {
	approveTaskDispatch,
	assertKnownAssignees,
	assertTeamCanRun,
	blockUnreachableTasks,
	skipPendingTasks,
} from "#agent/orchestrator/governance";
import { planTasks } from "#agent/orchestrator/planner";
import { Scheduler } from "#agent/orchestrator/scheduler";
import type {
	OrchestratorConfig,
	PlanOptions,
	PlanResult,
	RunTeamOptions,
	RunTeamResult,
} from "#agent/orchestrator/types";
import { type Task, TaskQueue } from "#agent/task/task";
import type { TaskInput } from "#agent/task/types";
import type { Team } from "#agent/team/team";

export class Orchestrator {
	private readonly scheduler: Scheduler;
	private readonly maxConcurrency: number;
	private readonly onProgress?: OrchestratorConfig["onProgress"];
	private readonly onTaskVerify?: OrchestratorConfig["onTaskVerify"];
	private readonly onTaskFailure?: OrchestratorConfig["onTaskFailure"];
	private readonly runBudget?: OrchestratorConfig["runBudget"];
	private readonly checkpointStore?: OrchestratorConfig["checkpointStore"];

	constructor(config: OrchestratorConfig = {}) {
		this.scheduler = new Scheduler({
			schedulingStrategy: config.schedulingStrategy,
			schedulingWeights: config.schedulingWeights,
		});
		this.maxConcurrency = config.maxConcurrency ?? 4;
		this.onProgress = config.onProgress;
		this.onTaskVerify = config.onTaskVerify;
		this.onTaskFailure = config.onTaskFailure;
		this.runBudget = resolveRunBudget(config.runBudget);
		this.checkpointStore = config.checkpointStore;
	}

	async plan(team: Team, goal: string, options: PlanOptions): Promise<PlanResult> {
		assertTeamCanRun(team);
		return planTasks(team, goal, options);
	}

	async run(team: Team, tasks: readonly (Task | TaskInput)[], options: RunTeamOptions = {}): Promise<RunTeamResult> {
		assertTeamCanRun(team);
		const checkpoint = await loadCheckpoint(this.checkpointStore ?? options.checkpointStore);
		const queue = checkpoint
			? TaskQueue.fromSnapshot(normalizeCheckpoint(checkpoint).tasks, { resetInProgress: true })
			: new TaskQueue();
		if (!checkpoint) queue.addBatch(tasks);
		assertKnownAssignees(queue, team);
		const normalizedRunBudget = resolveRunBudget(options.runBudget ?? this.runBudget);
		const context = createRunContext({
			team,
			queue,
			options,
			scheduler: this.scheduler,
			defaultMaxConcurrency: this.maxConcurrency,
			defaultOnProgress: this.onProgress,
			defaultOnTaskVerify: this.onTaskVerify,
			defaultOnTaskFailure: this.onTaskFailure,
			checkpointStore: options.checkpointStore ?? this.checkpointStore,
			runBudget: normalizedRunBudget,
			initialMetrics: checkpoint?.metrics,
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
			tasks: snapshots,
			metrics: context.metricsSnapshot(),
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
				const ready = context.scheduler.assignReadyTasks(
					context.queue.ready(),
					context.queue.snapshots(),
					context.team.getAgents(),
					context.options,
				);
				const next = ready.find((task) => !context.inFlight.has(task.id));
				if (!next) break;
				const nextSnapshot = next.snapshot();
				context.emitTrace({
					type: "task_dispatch",
					runStatus: context.aborted ? "aborted" : "running",
					taskId: nextSnapshot.id,
					taskTitle: nextSnapshot.title,
					data: { assignee: nextSnapshot.assignee ?? null },
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

async function loadCheckpoint(
	checkpointStore: OrchestratorConfig["checkpointStore"] | RunTeamOptions["checkpointStore"] | undefined,
) {
	if (!checkpointStore) return undefined;
	const checkpoint = await checkpointStore.load();
	return checkpoint ? normalizeCheckpoint(checkpoint) : undefined;
}
