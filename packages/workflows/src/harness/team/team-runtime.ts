import { readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { projectCompactStateFor } from "#workflows/harness/shared/compaction/compact-state-registry";
import {
	type EvidenceMatrixVerdict,
	evidenceMatrixPasses,
	type GateEscalation,
	type ReviewReportVerdict,
	reviewReportBlocks,
	validateEvidenceMatrixVerdict,
	validateReviewReportVerdict,
} from "#workflows/harness/shared/orchestration/gate-verdicts";
import {
	teamConfigPath,
	teamDir,
	teamEventsPath,
	teamGateArtifactPath,
	teamMailboxPath,
	teamTaskGateArtifactPath,
	teamTaskPath,
	workflowStatePath,
} from "#workflows/harness/shared/session/session-layout";
import { syncWorkflowActiveState } from "#workflows/harness/shared/state/active-state";
import {
	appendJsonl,
	readExistingStateForMutation,
	readFileOrLiteral,
	sha256,
	writeJsonAtomic,
} from "#workflows/harness/shared/state/state-writer";
import {
	defaultWorkflowId,
	readWorkflowState,
	writeWorkflowState,
} from "#workflows/harness/shared/state/workflow-state";
import { buildTeamHud } from "#workflows/harness/team/team-hud";

export type TeamPhase = "starting" | "running" | "awaiting_integration" | "complete" | "failed" | "cancelled";
export type TeamTaskStatus = "pending" | "blocked" | "in_progress" | "completed" | "failed";

export interface TeamWorker {
	id: string;
	name: string;
	role: string;
	status: "idle" | "working" | "blocked" | "done" | "failed";
	assigned_tasks: string[];
	updated_at: string;
}

export interface TeamConfig {
	team_id: string;
	display_name: string;
	task: string;
	phase: TeamPhase;
	workers: TeamWorker[];
	completion_gate?: TeamCompletionGate;
	gate_escalation?: TeamGateEscalation;
	created_at: string;
	updated_at: string;
}

export interface TeamGateEscalation {
	gate: "completion";
	status: "retry_requested" | "human_blocked";
	attempt: number;
	reason: string;
	updated_at: string;
}

export interface TeamCompletionGate {
	gate: "completion";
	status: "passed" | "blocked" | "retry_requested" | "human_blocked";
	attempt: number;
	artifact_path?: string;
	ship_decision?: EvidenceMatrixVerdict["ship_decision"];
	escalation?: GateEscalation;
	summary?: string;
	updated_at: string;
}

export interface TeamTask {
	id: string;
	title: string;
	description: string;
	status: TeamTaskStatus;
	owner?: string;
	assignee?: string;
	depends_on?: string[];
	blocked_by?: string[];
	review_gate?: TeamReviewGate;
	gate_escalation?: TeamTaskGateEscalation;
	completion_evidence?: TeamCompletionEvidence;
	version: number;
	created_at: string;
	updated_at: string;
	completed_at?: string;
}

export interface TeamReviewGate {
	gate: "review";
	status: "passed" | "blocked" | "retry_requested" | "human_blocked";
	attempt: number;
	artifact_path?: string;
	max_severity?: ReviewReportVerdict["max_severity"];
	needs_changes?: boolean;
	summary?: string;
	updated_at: string;
}

export interface TeamTaskGateEscalation {
	gate: "review";
	status: "retry_requested" | "human_blocked";
	attempt: number;
	reason: string;
	updated_at: string;
}

export interface TeamCompletionEvidence {
	summary: string;
	files?: string[];
	verification?: string[];
	recorded_by: string;
	recorded_at: string;
}

export interface TeamSnapshot {
	team_id?: string;
	phase: TeamPhase | "missing";
	state_dir?: string;
	task_total: number;
	task_counts: Record<TeamTaskStatus, number>;
	workers: TeamWorker[];
	tasks: TeamTask[];
	completion_gate?: TeamCompletionGate;
	updated_at: string;
}

function nowIso(): string {
	return new Date().toISOString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertSafeId(label: string, value: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value) || value.includes("..")) {
		throw new Error(`invalid ${label}: ${value}`);
	}
}

function sanitizeSlug(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 40)
			.replace(/-$/, "") || "team"
	);
}

function normalizeStatus(value: unknown): TeamTaskStatus {
	return value === "pending" ||
		value === "blocked" ||
		value === "in_progress" ||
		value === "completed" ||
		value === "failed"
		? value
		: "pending";
}

function parseStatus(value: string): TeamTaskStatus {
	const status = normalizeStatus(value);
	if (status === "pending" && value !== "pending") throw new Error(`invalid team task status: ${value}`);
	return status;
}

function normalizeStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const items = [
		...new Set(
			value
				.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
				.map((item) => item.trim()),
		),
	].sort();
	return items.length > 0 ? items : undefined;
}

function normalizeTask(raw: unknown): TeamTask {
	if (!isPlainObject(raw)) throw new Error("team task must be an object");
	const now = nowIso();
	const id = typeof raw.id === "string" ? raw.id : defaultWorkflowId("task");
	assertSafeId("task_id", id);
	const createdAt = typeof raw.created_at === "string" ? raw.created_at : now;
	return {
		id,
		title: typeof raw.title === "string" ? raw.title : id,
		description:
			typeof raw.description === "string" ? raw.description : typeof raw.objective === "string" ? raw.objective : "",
		status: normalizeStatus(raw.status),
		owner: typeof raw.owner === "string" ? raw.owner : undefined,
		assignee: typeof raw.assignee === "string" ? raw.assignee : undefined,
		depends_on: normalizeStringArray(raw.depends_on),
		blocked_by: normalizeStringArray(raw.blocked_by),
		review_gate: normalizeTeamReviewGate(raw.review_gate),
		gate_escalation: normalizeTeamTaskGateEscalation(raw.gate_escalation),
		completion_evidence: isPlainObject(raw.completion_evidence)
			? normalizeEvidence(id, raw.completion_evidence)
			: undefined,
		version: typeof raw.version === "number" && Number.isInteger(raw.version) ? raw.version : 1,
		created_at: createdAt,
		updated_at: typeof raw.updated_at === "string" ? raw.updated_at : createdAt,
		completed_at: typeof raw.completed_at === "string" ? raw.completed_at : undefined,
	};
}

function normalizeEvidence(taskId: string, raw: Record<string, unknown>): TeamCompletionEvidence {
	const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
	if (summary.length < 16) throw new Error(`invalid completion evidence for ${taskId}: summary is too short`);
	return {
		summary,
		files: normalizeStringArray(raw.files),
		verification: normalizeStringArray(raw.verification),
		recorded_by:
			typeof raw.recorded_by === "string"
				? raw.recorded_by
				: typeof raw.recordedBy === "string"
					? raw.recordedBy
					: "leader",
		recorded_at: typeof raw.recorded_at === "string" ? raw.recorded_at : nowIso(),
	};
}

function normalizeTeamReviewGate(value: unknown): TeamReviewGate | undefined {
	if (!isPlainObject(value)) return undefined;
	const status = value.status;
	if (status !== "passed" && status !== "blocked" && status !== "retry_requested" && status !== "human_blocked") {
		return undefined;
	}
	return {
		gate: "review",
		status,
		attempt: typeof value.attempt === "number" && Number.isInteger(value.attempt) ? value.attempt : 0,
		artifact_path: typeof value.artifact_path === "string" ? value.artifact_path : undefined,
		max_severity:
			value.max_severity === "none" ||
			value.max_severity === "low" ||
			value.max_severity === "medium" ||
			value.max_severity === "high"
				? value.max_severity
				: undefined,
		needs_changes: typeof value.needs_changes === "boolean" ? value.needs_changes : undefined,
		summary: typeof value.summary === "string" ? value.summary : undefined,
		updated_at: typeof value.updated_at === "string" ? value.updated_at : nowIso(),
	};
}

function normalizeTeamTaskGateEscalation(value: unknown): TeamTaskGateEscalation | undefined {
	if (!isPlainObject(value)) return undefined;
	if (value.gate !== "review") return undefined;
	if (value.status !== "retry_requested" && value.status !== "human_blocked") return undefined;
	return {
		gate: "review",
		status: value.status,
		attempt: typeof value.attempt === "number" && Number.isInteger(value.attempt) ? value.attempt : 0,
		reason: typeof value.reason === "string" ? value.reason : "review gate blocked",
		updated_at: typeof value.updated_at === "string" ? value.updated_at : nowIso(),
	};
}

function normalizeTeamCompletionGate(value: unknown): TeamCompletionGate | undefined {
	if (!isPlainObject(value)) return undefined;
	const status = value.status;
	if (status !== "passed" && status !== "blocked" && status !== "retry_requested" && status !== "human_blocked") {
		return undefined;
	}
	const attempt = typeof value.attempt === "number" && Number.isInteger(value.attempt) ? value.attempt : 0;
	return {
		gate: "completion",
		status,
		attempt,
		artifact_path: typeof value.artifact_path === "string" ? value.artifact_path : undefined,
		ship_decision:
			value.ship_decision === "ship" ||
			value.ship_decision === "ship_with_caveats" ||
			value.ship_decision === "blocked"
				? value.ship_decision
				: undefined,
		escalation:
			value.escalation === "none" || value.escalation === "retry" || value.escalation === "human_blocked"
				? value.escalation
				: undefined,
		summary: typeof value.summary === "string" ? value.summary : undefined,
		updated_at: typeof value.updated_at === "string" ? value.updated_at : nowIso(),
	};
}

function normalizeTeamGateEscalation(value: unknown): TeamGateEscalation | undefined {
	if (!isPlainObject(value)) return undefined;
	if (value.gate !== "completion") return undefined;
	if (value.status !== "retry_requested" && value.status !== "human_blocked") return undefined;
	return {
		gate: "completion",
		status: value.status,
		attempt: typeof value.attempt === "number" && Number.isInteger(value.attempt) ? value.attempt : 0,
		reason: typeof value.reason === "string" ? value.reason : "completion gate blocked",
		updated_at: typeof value.updated_at === "string" ? value.updated_at : nowIso(),
	};
}

function emptyCounts(): Record<TeamTaskStatus, number> {
	return { pending: 0, blocked: 0, in_progress: 0, completed: 0, failed: 0 };
}

function taskCounts(tasks: readonly TeamTask[]): Record<TeamTaskStatus, number> {
	const counts = emptyCounts();
	for (const task of tasks) counts[task.status] += 1;
	return counts;
}

async function appendTeamEvent(
	cwd: string,
	teamId: string,
	event: Record<string, unknown>,
	sessionId: string,
): Promise<void> {
	await appendJsonl(
		teamEventsPath(cwd, teamId, sessionId),
		{ event_id: defaultWorkflowId("evt"), ts: nowIso(), ...event },
		{ cwd },
	);
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
	const read = await readExistingStateForMutation(path);
	if (read.kind === "absent") return undefined;
	if (read.kind === "corrupt") throw new Error(`JSON state is corrupt: ${read.error}`);
	return read.value;
}

async function readTeamConfig(cwd: string, teamId: string, sessionId: string): Promise<TeamConfig | undefined> {
	const raw = await readJsonObject(teamConfigPath(cwd, teamId, sessionId));
	if (!raw) return undefined;
	const now = nowIso();
	const workers = Array.isArray(raw.workers) ? raw.workers : [];
	return {
		team_id: typeof raw.team_id === "string" ? raw.team_id : teamId,
		display_name: typeof raw.display_name === "string" ? raw.display_name : teamId,
		task: typeof raw.task === "string" ? raw.task : "",
		phase:
			raw.phase === "starting" ||
			raw.phase === "running" ||
			raw.phase === "awaiting_integration" ||
			raw.phase === "complete" ||
			raw.phase === "failed" ||
			raw.phase === "cancelled"
				? raw.phase
				: "running",
		completion_gate: normalizeTeamCompletionGate(raw.completion_gate),
		gate_escalation: normalizeTeamGateEscalation(raw.gate_escalation),
		workers: workers.filter(isPlainObject).map(
			(worker, index): TeamWorker => ({
				id: typeof worker.id === "string" ? worker.id : `worker-${index + 1}`,
				name: typeof worker.name === "string" ? worker.name : `Worker ${index + 1}`,
				role: typeof worker.role === "string" ? worker.role : "implementation",
				status:
					worker.status === "working" ||
					worker.status === "blocked" ||
					worker.status === "done" ||
					worker.status === "failed"
						? worker.status
						: "idle",
				assigned_tasks: normalizeStringArray(worker.assigned_tasks) ?? [],
				updated_at: typeof worker.updated_at === "string" ? worker.updated_at : now,
			}),
		),
		created_at: typeof raw.created_at === "string" ? raw.created_at : now,
		updated_at: typeof raw.updated_at === "string" ? raw.updated_at : now,
	};
}

async function activeTeamId(cwd: string, sessionId: string): Promise<string | undefined> {
	const state = await readWorkflowState(cwd, "team", { sessionId }).catch(() => undefined);
	return typeof state?.team_id === "string" ? state.team_id : undefined;
}

async function resolveTeamId(cwd: string, sessionId: string, teamId?: string): Promise<string> {
	const resolved = teamId?.trim() || (await activeTeamId(cwd, sessionId));
	if (!resolved) throw new Error("missing team_id");
	assertSafeId("team_id", resolved);
	return resolved;
}

async function listTasks(cwd: string, teamId: string, sessionId: string): Promise<TeamTask[]> {
	let entries: string[];
	try {
		entries = await readdir(dirname(teamTaskPath(cwd, teamId, "placeholder", sessionId)));
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return [];
		throw error;
	}
	const tasks: TeamTask[] = [];
	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		const raw = await readJsonObject(teamTaskPath(cwd, teamId, entry.slice(0, -5), sessionId));
		if (raw) tasks.push(normalizeTask(raw));
	}
	return tasks.sort((a, b) => a.id.localeCompare(b.id));
}

async function syncTeamState(cwd: string, snapshot: TeamSnapshot, sessionId: string): Promise<void> {
	const active = snapshot.phase !== "missing" && snapshot.phase !== "complete" && snapshot.phase !== "cancelled";
	const state = await writeWorkflowState(
		cwd,
		"team",
		{
			active,
			current_phase: snapshot.phase,
			team_id: snapshot.team_id,
			task_counts: snapshot.task_counts,
		},
		"pi workflow state write",
		{ operation: "runtime-sync", sessionId },
	);
	await syncWorkflowActiveState(
		cwd,
		{
			skill: "team",
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(cwd, "team", sessionId),
			hud: buildTeamHud(snapshot),
		},
		{ sessionId },
	);
}

export async function startTeam(
	cwd: string,
	input: { task: string; teamId?: string; workers?: Array<{ id?: string; name?: string; role?: string }> },
	sessionId: string,
): Promise<TeamSnapshot> {
	const task = (await readFileOrLiteral(input.task, cwd)).trim();
	if (!task) throw new Error("team task is required");
	const teamId = input.teamId?.trim() || `${sanitizeSlug(task)}-${sha256(task).slice(0, 8)}`;
	assertSafeId("team_id", teamId);
	const now = nowIso();
	const workers: TeamWorker[] = (
		input.workers && input.workers.length > 0 ? input.workers : [{ role: "implementation" }, { role: "verification" }]
	).map((worker, index) => ({
		id: worker.id ?? `worker-${index + 1}`,
		name: worker.name ?? `Worker ${index + 1}`,
		role: worker.role ?? "implementation",
		status: "idle",
		assigned_tasks: [],
		updated_at: now,
	}));
	for (const worker of workers) assertSafeId("worker_id", worker.id);
	const config: TeamConfig = {
		team_id: teamId,
		display_name: teamId,
		task,
		phase: "running",
		workers,
		created_at: now,
		updated_at: now,
	};
	await writeJsonAtomic(teamConfigPath(cwd, teamId, sessionId), { ...config }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{ type: "team_started", message: task, data: { worker_count: workers.length } },
		sessionId,
	);
	const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
	await syncTeamState(cwd, snapshot, sessionId);
	return snapshot;
}

export async function readTeamSnapshot(cwd: string, sessionId: string, teamId?: string): Promise<TeamSnapshot> {
	const teamIdResolved = teamId?.trim() || (await activeTeamId(cwd, sessionId));
	if (!teamIdResolved)
		return {
			phase: "missing",
			task_total: 0,
			task_counts: emptyCounts(),
			workers: [],
			tasks: [],
			updated_at: nowIso(),
		};
	assertSafeId("team_id", teamIdResolved);
	const config = await readTeamConfig(cwd, teamIdResolved, sessionId);
	if (!config)
		return {
			team_id: teamIdResolved,
			phase: "missing",
			task_total: 0,
			task_counts: emptyCounts(),
			workers: [],
			tasks: [],
			updated_at: nowIso(),
		};
	const tasks = await listTasks(cwd, teamIdResolved, sessionId);
	const counts = taskCounts(tasks);
	const phase =
		config.phase === "running" && tasks.length > 0 && tasks.every((task) => task.status === "completed")
			? "awaiting_integration"
			: config.phase;
	return {
		team_id: teamIdResolved,
		phase,
		state_dir: teamDir(cwd, sessionId),
		task_total: tasks.length,
		task_counts: counts,
		workers: config.workers,
		tasks,
		completion_gate: config.completion_gate,
		updated_at: config.updated_at,
	};
}

export async function createTeamTask(
	cwd: string,
	input: { teamId?: string; id?: string; title: string; description: string; owner?: string; dependsOn?: string[] },
	sessionId: string,
): Promise<TeamTask> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	const id = input.id?.trim() || `task-${sha256(`${input.title}\n${input.description}`).slice(0, 12)}`;
	assertSafeId("task_id", id);
	const existing = await readJsonObject(teamTaskPath(cwd, teamId, id, sessionId));
	if (existing) throw new Error(`team task already exists: ${id}`);
	const now = nowIso();
	const task = normalizeTask({
		id,
		title: input.title,
		description: input.description,
		owner: input.owner,
		depends_on: input.dependsOn,
		status: "pending",
		version: 1,
		created_at: now,
		updated_at: now,
	});
	await writeJsonAtomic(teamTaskPath(cwd, teamId, id, sessionId), { ...task }, { cwd });
	await appendTeamEvent(cwd, teamId, { type: "task_created", task_id: id, message: task.title }, sessionId);
	await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
	return task;
}

function passingReviewGate(task: TeamTask): boolean {
	return task.review_gate?.gate === "review" && task.review_gate.status === "passed";
}

async function writeReviewGateBlock(
	cwd: string,
	teamId: string,
	task: TeamTask,
	sessionId: string,
	reason: string,
): Promise<TeamTask> {
	const attempt = (task.review_gate?.attempt ?? task.gate_escalation?.attempt ?? 0) + 1;
	const status = attempt >= 2 ? "human_blocked" : "retry_requested";
	const now = nowIso();
	const next: TeamTask = {
		...task,
		status: status === "human_blocked" ? "blocked" : task.status,
		review_gate: { gate: "review", status, attempt, updated_at: now },
		gate_escalation: { gate: "review", status, attempt, reason, updated_at: now },
		updated_at: now,
	};
	await writeJsonAtomic(teamTaskPath(cwd, teamId, next.id, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{ type: "team_review_gate_blocked", task_id: next.id, message: reason, data: { status, attempt } },
		sessionId,
	);
	return next;
}

export async function recordTeamReviewGateArtifact(
	cwd: string,
	input: { teamId?: string; taskId: string; reviewReport: unknown; recordedBy?: string },
	sessionId: string,
): Promise<TeamReviewGate> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	assertSafeId("task_id", input.taskId);
	const current = normalizeTask(
		(await readJsonObject(teamTaskPath(cwd, teamId, input.taskId, sessionId))) ??
			(() => {
				throw new Error(`unknown team task: ${input.taskId}`);
			})(),
	);
	const verdict = validateReviewReportVerdict(input.reviewReport);
	const attempt = (current.review_gate?.attempt ?? 0) + 1;
	const artifactPath = teamTaskGateArtifactPath(cwd, teamId, current.id, "review", attempt, sessionId);
	await writeJsonAtomic(
		artifactPath,
		{
			artifact_type: "review_report",
			team_id: teamId,
			task_id: current.id,
			gate: "review",
			attempt,
			recorded_by: input.recordedBy ?? "reviewer",
			recorded_at: nowIso(),
			...verdict,
		},
		{ cwd },
	);
	const now = nowIso();
	const blocks = reviewReportBlocks(verdict);
	const escalated = blocks && attempt >= 2;
	const gate: TeamReviewGate = {
		gate: "review",
		status: blocks ? (escalated ? "human_blocked" : "blocked") : "passed",
		attempt,
		artifact_path: artifactPath,
		max_severity: verdict.max_severity,
		needs_changes: verdict.needs_changes,
		summary: verdict.summary,
		updated_at: now,
	};
	const next: TeamTask = {
		...current,
		review_gate: gate,
		gate_escalation: blocks
			? {
					gate: "review",
					status: escalated ? "human_blocked" : "retry_requested",
					attempt,
					reason: verdict.summary ?? "review_report has high-severity needs_changes",
					updated_at: now,
				}
			: undefined,
		updated_at: now,
	};
	await writeJsonAtomic(teamTaskPath(cwd, teamId, next.id, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "team_review_gate_recorded",
			task_id: next.id,
			message: gate.status,
			data: { status: gate.status, attempt, artifact_path: artifactPath, max_severity: verdict.max_severity },
		},
		sessionId,
	);
	await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
	return gate;
}

export async function transitionTeamTask(
	cwd: string,
	input: {
		teamId?: string;
		taskId: string;
		status: string;
		workerId?: string;
		evidence?: Omit<TeamCompletionEvidence, "recorded_at">;
	},
	sessionId: string,
): Promise<TeamTask> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	assertSafeId("task_id", input.taskId);
	const current = normalizeTask(
		(await readJsonObject(teamTaskPath(cwd, teamId, input.taskId, sessionId))) ??
			(() => {
				throw new Error(`unknown team task: ${input.taskId}`);
			})(),
	);
	const status = parseStatus(input.status);
	const now = nowIso();
	if (status === "completed" && !input.evidence)
		throw new Error("completion evidence is required for completed team tasks");
	if (status === "completed" && !passingReviewGate(current)) {
		const reason = "completed team tasks require a passing reviewer review_report";
		const blocked = await writeReviewGateBlock(cwd, teamId, current, sessionId, reason);
		await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
		throw new Error(`${reason}; review gate ${blocked.review_gate?.status ?? "blocked"}`);
	}
	const next: TeamTask = {
		...current,
		status,
		assignee: input.workerId ?? current.assignee,
		completion_evidence: input.evidence
			? normalizeEvidence(current.id, { ...input.evidence, recorded_at: now })
			: current.completion_evidence,
		version: current.version + 1,
		updated_at: now,
		completed_at: status === "completed" ? now : current.completed_at,
	};
	await writeJsonAtomic(teamTaskPath(cwd, teamId, next.id, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "task_transitioned",
			task_id: next.id,
			worker: input.workerId,
			message: status,
			data: { status },
		},
		sessionId,
	);
	await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
	return next;
}

export async function sendTeamMessage(
	cwd: string,
	input: { teamId?: string; from: string; to: string; body: string; idempotencyKey?: string },
	sessionId: string,
): Promise<Record<string, unknown>> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	assertSafeId("worker_id", input.from);
	assertSafeId("worker_id", input.to);
	const body = input.body.trim();
	if (!body) throw new Error("message body is required");
	const message = {
		message_id: `msg-${sha256([teamId, input.from, input.to, input.idempotencyKey ?? body].join(":"))}`,
		from_worker: input.from,
		to_worker: input.to,
		body,
		created_at: nowIso(),
		idempotency_key: input.idempotencyKey,
	};
	await appendJsonl(teamMailboxPath(cwd, teamId, input.to, sessionId), message, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "message_sent",
			worker: input.from,
			message: message.message_id,
			data: { to_worker: input.to },
		},
		sessionId,
	);
	return message;
}

function passingCompletionGate(config: TeamConfig): boolean {
	return config.completion_gate?.gate === "completion" && config.completion_gate.status === "passed";
}

async function writeCompletionGateBlock(
	cwd: string,
	teamId: string,
	config: TeamConfig,
	sessionId: string,
	reason: string,
): Promise<TeamConfig> {
	const attempt = (config.completion_gate?.attempt ?? config.gate_escalation?.attempt ?? 0) + 1;
	const status = attempt >= 2 ? "human_blocked" : "retry_requested";
	const now = nowIso();
	const gate: TeamCompletionGate = {
		gate: "completion",
		status,
		attempt,
		updated_at: now,
	};
	const gateEscalation: TeamGateEscalation = {
		gate: "completion",
		status,
		attempt,
		reason,
		updated_at: now,
	};
	const next: TeamConfig = { ...config, completion_gate: gate, gate_escalation: gateEscalation, updated_at: now };
	await writeJsonAtomic(teamConfigPath(cwd, teamId, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "team_completion_gate_blocked",
			message: reason,
			data: { gate: "completion", status, attempt },
		},
		sessionId,
	);
	return next;
}

export async function recordTeamCompletionGateArtifact(
	cwd: string,
	input: { teamId?: string; evidenceMatrix: unknown; recordedBy?: string },
	sessionId: string,
): Promise<TeamCompletionGate> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	const config = await readTeamConfig(cwd, teamId, sessionId);
	if (!config) throw new Error(`unknown team: ${teamId}`);
	const verdict = validateEvidenceMatrixVerdict(input.evidenceMatrix);
	const attempt = (config.completion_gate?.attempt ?? 0) + 1;
	const artifactPath = teamGateArtifactPath(cwd, teamId, "completion", attempt, sessionId);
	await writeJsonAtomic(
		artifactPath,
		{
			artifact_type: "evidence_matrix",
			team_id: teamId,
			gate: "completion",
			attempt,
			recorded_by: input.recordedBy ?? "prover",
			recorded_at: nowIso(),
			...verdict,
		},
		{ cwd },
	);
	const now = nowIso();
	const passed = evidenceMatrixPasses(verdict);
	const escalated = !passed && (verdict.escalation === "human_blocked" || attempt >= 2);
	const gate: TeamCompletionGate = {
		gate: "completion",
		status: passed ? "passed" : escalated ? "human_blocked" : "blocked",
		attempt,
		artifact_path: artifactPath,
		ship_decision: verdict.ship_decision,
		escalation: verdict.escalation,
		summary: verdict.summary,
		updated_at: now,
	};
	const next: TeamConfig = {
		...config,
		completion_gate: gate,
		gate_escalation: passed
			? undefined
			: {
					gate: "completion",
					status: escalated ? "human_blocked" : "retry_requested",
					attempt,
					reason: verdict.summary ?? `prover evidence_matrix did not pass: ${verdict.ship_decision}`,
					updated_at: now,
				},
		updated_at: now,
	};
	await writeJsonAtomic(teamConfigPath(cwd, teamId, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "team_completion_gate_recorded",
			message: gate.status,
			data: {
				gate: "completion",
				status: gate.status,
				attempt,
				artifact_path: artifactPath,
				ship_decision: verdict.ship_decision,
				escalation: verdict.escalation,
			},
		},
		sessionId,
	);
	await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
	return gate;
}

export async function completeTeam(
	cwd: string,
	input: { teamId?: string; phase?: "complete" | "failed" | "cancelled"; summary?: string },
	sessionId: string,
): Promise<TeamSnapshot> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	const config = await readTeamConfig(cwd, teamId, sessionId);
	if (!config) throw new Error(`unknown team: ${teamId}`);
	const phase = input.phase ?? "complete";
	if (phase === "complete" && !passingCompletionGate(config)) {
		const reason = "team completion requires a passing prover evidence_matrix";
		const blocked = await writeCompletionGateBlock(cwd, teamId, config, sessionId, reason);
		await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
		throw new Error(`${reason}; completion gate ${blocked.completion_gate?.status ?? "blocked"}`);
	}
	const next = { ...config, phase, updated_at: nowIso() };
	await writeJsonAtomic(teamConfigPath(cwd, teamId, sessionId), next, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{ type: "team_closed", message: input.summary ?? phase, data: { phase } },
		sessionId,
	);
	const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
	await syncTeamState(cwd, snapshot, sessionId);
	return snapshot;
}

export async function readTeamCompact(
	cwd: string,
	sessionId: string,
	teamId?: string,
): Promise<Record<string, unknown>> {
	const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
	const completionGate = snapshot.team_id
		? (await readTeamConfig(cwd, snapshot.team_id, sessionId))?.completion_gate
		: undefined;
	return projectCompactStateFor<Record<string, unknown>>("team", { snapshot, completionGate });
}
