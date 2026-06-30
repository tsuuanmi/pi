import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolvePath } from "@tsuuanmi/pi-coding-agent";
import { readWorkflowActiveState } from "../shared/active-state.ts";

/**
 * Deep-interview phase-boundary mutation guard.
 *
 * Ports the runtime-owned enforcement from gajae-code's
 * `skill-state/deep-interview-mutation-guard.ts`, adapted to Pi's layout
 * (`.pi/` session-scoped state, `readWorkflowActiveState`, the `tool_call`
 * extension hook) and Pi's tool set (`edit` + `write`; Pi has no `ast_edit`,
 * `apply_patch`, or `vim` edit modes).
 *
 * Two independent rules:
 *
 * 1. **Always-on runtime-state protection.** Agent `edit`/`write` tools must
 *    never mutate `.pi/**` (workflow state, specs, plans, audit). Workflow
 *    artifacts are persisted only through the sanctioned Pi workflow tools.
 *    This rule fires regardless of whether a planning skill is active.
 *
 * 2. **Pre-approval phase boundary.** While a `deep-interview` workflow is
 *    active in a non-finished phase, `edit`/`write` are blocked for every
 *    target inside the project tree. The only escape is a *neutral* scratch
 *    path that resolves outside the project cwd and inside a system temp
 *    directory, so an agent can still stage an artifact in `/tmp` and feed its
 *    path to the sanctioned writer. Deep-interview is a requirements skill;
 *    it must not mutate product code until the user explicitly approves an
 *    execution handoff.
 *
 * Fail-open contract: a missing or unreadable active-state file releases the
 * phase-boundary block (a corrupt state file must not lock all mutation). The
 * always-on `.pi/**` rule is lexical and never depends on state readability.
 */

export const DEEP_INTERVIEW_MUTATION_BLOCK_MESSAGE =
	"Deep-interview phase boundary: continue gathering context/questions/risks and emit a spec or hand off before code edits. Mutation tools are blocked while deep-interview is active; finalize the spec with `deep_interview_write_spec` or hand off to an execution skill before mutating product code.";
export const WORKFLOW_STATE_MUTATION_BLOCK_MESSAGE =
	"`.pi` workflow state and artifacts are runtime-owned. Agent mutation tools cannot edit `.pi/**`; use the sanctioned `pi` workflow tools (e.g. `deep_interview_write_spec`) instead.";

const BLOCKED_TOOL_NAMES = new Set(["edit", "write"]);

/**
 * Phases that genuinely finish a workflow skill. `handoff` is intentionally
 * absent so a handoff-required planning skill keeps blocking through its
 * handoff window until it is demoted or cleared. Mirrors gajae-code's
 * `WORKFLOW_FINISHED_PHASES`.
 */
const WORKFLOW_FINISHED_PHASES = new Set(["complete", "completed", "failed", "cancelled", "canceled", "inactive"]);

export interface MutationGuardInput {
	cwd: string;
	sessionId?: string;
	/** Tool name, e.g. "edit" or "write". Non-mutation tools are never blocked. */
	toolName: string;
	/** Validated tool arguments (the `tool_call` event `input`). */
	input: Record<string, unknown>;
	/** Internal recovery bypass. Never set by the agent-facing hook. */
	forceOverride?: boolean;
	/** Disable the always-on `.pi/**` block. Defaults to true (enforce). */
	enforceWorkflowState?: boolean;
}

export interface MutationGuardDecision {
	blocked: boolean;
	message?: string;
	/** Target paths the guard inspected. */
	targets: string[];
	/** Machine-readable block reason. */
	reason?: string;
}

interface ExtractedTargets {
	paths: string[];
	unknown: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addPath(targets: ExtractedTargets, value: unknown): void {
	if (typeof value === "string" && value.trim().length > 0) {
		targets.paths.push(value.trim());
	}
}

function extractEditTargets(input: Record<string, unknown>): ExtractedTargets {
	const targets: ExtractedTargets = { paths: [], unknown: false };
	addPath(targets, input.path);
	addPath(targets, input.file);
	const edits = input.edits;
	if (Array.isArray(edits)) {
		for (const edit of edits) {
			const record = isPlainObject(edit) ? edit : null;
			// Pi's edit schema has no rename/path per-edit fields, but tolerate
			// them defensively so a future schema change can't bypass the guard.
			addPath(targets, record?.path);
			addPath(targets, record?.rename);
		}
	}
	if (targets.paths.length === 0) targets.unknown = true;
	return targets;
}

function extractWriteTargets(input: Record<string, unknown>): ExtractedTargets {
	const targets: ExtractedTargets = { paths: [], unknown: false };
	addPath(targets, input.path);
	if (targets.paths.length === 0) targets.unknown = true;
	return targets;
}

function extractTargets(toolName: string, input: Record<string, unknown>): ExtractedTargets {
	if (toolName === "edit") return extractEditTargets(input);
	if (toolName === "write") return extractWriteTargets(input);
	return { paths: [], unknown: true };
}

/**
 * Resolve a raw tool path to an absolute path. Returns `undefined` when the
 * path cannot be resolved (empty, or an unsupported scheme).
 */
function resolveAbsolutePath(cwd: string, rawPath: string): string | undefined {
	const trimmed = rawPath.trim();
	if (!trimmed) return undefined;
	if (trimmed === ".") return path.resolve(cwd);
	return resolvePath(trimmed, cwd, { normalizeUnicodeSpaces: true, stripAtPrefix: true });
}

/**
 * `.pi/**` is always runtime-owned: lexical check against the project root.
 * Symlinks are not chased here because an edit target inside `.pi/` is
 * runtime-owned regardless of where it ultimately points.
 */
function isPiStatePath(cwd: string, rawPath: string): boolean {
	const absolutePath = resolveAbsolutePath(cwd, rawPath);
	if (!absolutePath) return false;
	const relative = path.relative(path.resolve(cwd), path.resolve(absolutePath));
	if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return false;
	const firstSegment = relative.split(path.sep)[0];
	return firstSegment === ".pi";
}

function hasPiStateTarget(cwd: string, targets: ExtractedTargets): boolean {
	return targets.paths.some((rawPath) => isPiStatePath(cwd, rawPath));
}

/**
 * Resolve the single active `deep-interview` entry for this context, or null.
 *
 * `readWorkflowActiveState` already filters to active entries, dedupes by
 * skill, and scopes by session, so the first matching deep-interview row is
 * the canonical current one. Fail-open: an absent/unreadable state file
 * returns undefined and releases the phase-boundary block.
 */
async function getActiveDeepInterview(cwd: string, sessionId?: string): Promise<{ phase: string } | null> {
	const resolvedSessionId = sessionId?.trim();
	if (!resolvedSessionId) return null;
	const state = await readWorkflowActiveState(cwd, { sessionId: resolvedSessionId }).catch(() => undefined);
	if (!state) return null;
	const entry = state.active_workflows.find((item) => item.skill === "deep-interview");
	if (!entry) return null;
	if (entry.active !== true) return null;
	const phase = (entry.phase ?? "").trim().toLowerCase();
	if (WORKFLOW_FINISHED_PHASES.has(phase)) return null;
	return { phase: entry.phase ?? "" };
}

function isPathWithin(root: string, target: string): boolean {
	const rel = path.relative(root, target);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function neutralTempRoots(): string[] {
	const roots = new Set<string>();
	const add = (value: string | undefined): void => {
		const trimmed = value?.trim();
		if (trimmed) roots.add(path.resolve(trimmed));
	};
	add(os.tmpdir());
	add(process.env.TMPDIR);
	for (const fixed of ["/tmp", "/var/tmp", "/private/tmp", "/private/var/tmp"]) add(fixed);
	return [...roots];
}

async function realpathOrSelf(target: string): Promise<string> {
	try {
		return await fs.realpath(target);
	} catch {
		return target;
	}
}

/**
 * Canonicalize a target whose leaf may not exist yet (we are about to write
 * it): realpath the nearest existing ancestor and re-append the not-yet-
 * existing suffix, so a symlinked ancestor (or macOS `/tmp` -> `/private/tmp`)
 * is resolved to its real location.
 */
async function canonicalizeForContainment(absolutePath: string): Promise<string> {
	const suffix: string[] = [];
	let current = absolutePath;
	for (let depth = 0; depth < 64; depth++) {
		try {
			const real = await fs.realpath(current);
			return suffix.length > 0 ? path.join(real, ...suffix.reverse()) : real;
		} catch {
			const parent = path.dirname(current);
			if (parent === current) break;
			suffix.push(path.basename(current));
			current = parent;
		}
	}
	return absolutePath;
}

/**
 * A neutral scratch path the phase-boundary block tolerates: it resolves to a
 * system temp directory and lives OUTSIDE the project cwd. Files inside the
 * project tree (product code, `.pi/**`) are never neutral, even when the cwd
 * itself is rooted under a temp dir. A canonical (symlink/alias-resolved)
 * re-check ensures the REAL target is still outside the project and inside a
 * real temp root, defeating a temp symlink that points back into the repo.
 */
async function isNeutralTempPath(cwd: string, rawPath: string): Promise<boolean> {
	const absolutePath = resolveAbsolutePath(cwd, rawPath);
	if (!absolutePath) return false;
	const resolvedCwd = path.resolve(cwd);
	if (isPathWithin(resolvedCwd, absolutePath)) return false;
	if (!neutralTempRoots().some((root) => isPathWithin(root, absolutePath))) return false;
	const realTarget = await canonicalizeForContainment(absolutePath);
	if (isPathWithin(await realpathOrSelf(resolvedCwd), realTarget)) return false;
	const realRoots = await Promise.all(neutralTempRoots().map(realpathOrSelf));
	return realRoots.some((root) => isPathWithin(root, realTarget));
}

/** Targets that remain disallowed during a planning phase (excludes neutral temp scratch). */
async function planningBlockedTargets(cwd: string, targets: ExtractedTargets): Promise<string[]> {
	const blocked: string[] = [];
	for (const rawPath of targets.paths) {
		if (!(await isNeutralTempPath(cwd, rawPath))) blocked.push(rawPath);
	}
	return blocked;
}

/**
 * Resolve the mutation decision for one `edit`/`write` invocation.
 *
 * The always-on `.pi/**` rule is checked first (ahead of `forceOverride`, in
 * parity with gajae-code: a forced recovery must not reach `.pi/**` either),
 * then the pre-approval phase boundary.
 */
export async function getDeepInterviewMutationDecision(input: MutationGuardInput): Promise<MutationGuardDecision> {
	if (!BLOCKED_TOOL_NAMES.has(input.toolName)) return { blocked: false, targets: [] };
	const targets = extractTargets(input.toolName, input.input);

	if (input.enforceWorkflowState !== false && hasPiStateTarget(input.cwd, targets)) {
		return {
			blocked: true,
			message: WORKFLOW_STATE_MUTATION_BLOCK_MESSAGE,
			targets: targets.paths,
			reason: "pi-state-target",
		};
	}

	const planning = await getActiveDeepInterview(input.cwd, input.sessionId);
	if (!planning) return { blocked: false, targets: targets.paths };
	if (input.forceOverride) return { blocked: false, targets: targets.paths };

	const message = DEEP_INTERVIEW_MUTATION_BLOCK_MESSAGE;
	if (targets.unknown) {
		return { blocked: true, message, targets: targets.paths, reason: "unknown-target" };
	}
	const blockedTargets = await planningBlockedTargets(input.cwd, targets);
	if (blockedTargets.length === 0) {
		return { blocked: false, targets: targets.paths };
	}
	return { blocked: true, message, targets: targets.paths, reason: "phase-boundary" };
}

/** Throw when the decision is blocked. Convenience for callers that prefer exceptions. */
export async function assertDeepInterviewMutationAllowed(input: MutationGuardInput): Promise<void> {
	const decision = await getDeepInterviewMutationDecision(input);
	if (decision.blocked) throw new Error(decision.message ?? DEEP_INTERVIEW_MUTATION_BLOCK_MESSAGE);
}
