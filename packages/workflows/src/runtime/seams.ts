/** Deferred-seam registry (Phase 3, Pi-first).
 *
 * An explicit, extensible list of designed-not-built harness extensions. Each unsupported seam
 * fails LOUDLY with a self-documenting `seam_unsupported:<name>` token (no silent degrade, no
 * vague crash). The list IS the documentation of what exists vs. what is deferred/blocked/not-built.
 *
 * The registry is wired live: `recoverPrimitive`'s `fallback-harness-exec` branch calls
 * {@link seamUnsupported}("cross-harness-omx-fallback") and folds its evidence into the blocked
 * decision, so requesting a permanently-blocked seam surfaces a named failure rather than a silent
 * no-op. Future extensions add entries here (or via {@link DeferredSeamRegistry.register}); the
 * orchestrator does not change. */
import type { Harness } from "#workflows/runtime/types";

/** Lifecycle status of a designed-not-built seam. */
export type DeferredSeamStatus = "deferred" | "permanentlyBlocked" | "not-built";

/** A single deferred-seam entry. */
export interface DeferredSeamEntry {
	name: string;
	status: DeferredSeamStatus;
	description: string;
}

/** Harnesses with a built control plane. Phase 3 ships only `pi`. */
const SUPPORTED_HARNESSES: readonly Harness[] = ["pi"];

/** The Pi-native deferred-seam set. `cross-harness-omx-fallback` is PERMANENTLY BLOCKED (no external
 * process spawn, ever); the rest are deferred/not-built and may land in future phases. */
export const DEFERRED_SEAMS: readonly DeferredSeamEntry[] = [
	{
		name: "tmux-session-orchestration",
		status: "deferred",
		description:
			"Observable autonomous operation via a tmux session owner. Sibling layer; deferred to a future phase.",
	},
	{
		name: "git-worktree-isolation",
		status: "deferred",
		description: "Per-session worktree isolation. Redundant with the Phase 2 vanish gate; deferred.",
	},
	{
		name: "cross-harness-omx-fallback",
		status: "permanentlyBlocked",
		description: "Permanently blocked cross-harness fallback seam. Pi-first: no subprocess spawn.",
	},
	{
		name: "remote-transport",
		status: "not-built",
		description: "Remote harness transport. Not built.",
	},
	{
		name: "global-daemon",
		status: "not-built",
		description: "Long-lived global coordination daemon. Not built.",
	},
	{
		name: "capability-token-auth",
		status: "not-built",
		description: "Capability-token authentication for control-plane RPC. Not built.",
	},
];

/** Extensible registry of deferred seams. Seed with {@link DEFERRED_SEAMS}; register additional
 * seams at runtime (e.g. for tests or future integrations) via {@link register}. */
export class DeferredSeamRegistry {
	private readonly entries = new Map<string, DeferredSeamEntry>();

	constructor(seed: readonly DeferredSeamEntry[] = DEFERRED_SEAMS) {
		for (const entry of seed) this.entries.set(entry.name, entry);
	}

	register(name: string, status: DeferredSeamStatus, description = ""): void {
		this.entries.set(name, { name, status, description });
	}

	lookup(name: string): DeferredSeamEntry | undefined {
		return this.entries.get(name);
	}

	list(): readonly DeferredSeamEntry[] {
		return [...this.entries.values()];
	}
}

/** Default shared registry instance, seeded with {@link DEFERRED_SEAMS}. */
export const deferredSeamRegistry = new DeferredSeamRegistry();

/** True iff `harness` has a built control plane (i.e. is in {@link SUPPORTED_HARNESSES}). */
export function isHarnessSupported(harness: Harness): boolean {
	return SUPPORTED_HARNESSES.includes(harness);
}

/** Result of requesting an unsupported seam: always `ok: false` with a named error token. */
export interface SeamUnsupportedResult {
	ok: false;
	error: string;
	evidence: { seam: true; name: string; supported: false; deferred: boolean; status: DeferredSeamStatus };
}

/** Fail closed with a named, self-documenting `seam_unsupported:<name>` token.
 *
 * `supported` is always `false` (this function is only called for unsupported seams). `deferred` is
 * `true` only for `status: "deferred"` entries (not for `permanentlyBlocked` / `not-built`). Pass a
 * custom `registry` for tests/future integrations; defaults to the shared instance. */
export function seamUnsupported(
	name: string,
	registry: DeferredSeamRegistry = deferredSeamRegistry,
): SeamUnsupportedResult {
	const entry = registry.lookup(name);
	const status = entry?.status ?? "not-built";
	return {
		ok: false,
		error: `seam_unsupported:${name}`,
		evidence: { seam: true, name, supported: false, deferred: status === "deferred", status },
	};
}
