import type { AgentState, StreamFn, ThinkingLevel } from "@tsuuanmi/pi-agent";
import type { Model } from "@tsuuanmi/pi-ai";
import type { ExtensionRunner } from "../extensions/index.ts";
import type { ModelRegistry } from "../model/model-registry.ts";
import type { SessionManager } from "../session/session-manager.ts";
import type { SettingsManager } from "../settings/settings-manager.ts";
import type { ResourceLoader } from "../skills/resource-loader.ts";
import type { AgentSessionEvent } from "./agent-session.ts";

/**
 * Type-only seam for the Phase-1 `AgentSession` subsystem extraction.
 *
 * No `AgentSession` import. `agent` is NOT exposed whole — only its `state`
 * (mutable reference) and `streamFn` are, so extracted modules cannot reach
 * core-loop concerns (`abort`/`subscribe`/`prompt`/`steer`/`followUp`/...).
 * Members are grown per extraction step: only the members a module reads are
 * added at that step, keeping the surface narrow and reviewable.
 *
 * The single accepted type-only edge is `import type { AgentSessionEvent }`:
 * `AgentSessionEvent` is defined in `agent-session.ts` and re-exported from
 * `src/index.ts`, so it cannot move without breaking the byte-for-byte public
 * SDK surface. This is a type-only import — erased at emit (this is a
 * strip-only TypeScript repo) — so there is no runtime cycle.
 *
 * IMPORTANT: the `AgentSession._ctx()` getter must allocate a FRESH object
 * literal on every call so live field values are read at call time. Do NOT
 * cache or memoize the context — caching would freeze stale
 * `model`/`scopedModels` and silently break ModelControl/TreeNavigation.
 * Per-call allocation of a ~10-field literal is negligible.
 *
 * Extracted AgentSession subsystem modules must NOT touch
 * `state.tools`/`state.systemPrompt`/`state.isStreaming` (orchestrator-core).
 */
export interface AgentSessionContext {
	// --- Common (shared baseline; present from first use) ---
	readonly cwd: string;
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;
	readonly modelRegistry: ModelRegistry;
	readonly resourceLoader: ResourceLoader;
	readonly extensionRunner: ExtensionRunner;
	emit(event: AgentSessionEvent): void;

	// --- Agent surface (narrow; NO whole `agent`) ---
	readonly state: AgentState;
	readonly streamFn: StreamFn;

	// --- StatsExport (Step 1) ---
	readonly sessionFile: string | undefined;
	readonly sessionId: string;
	readonly model: Model<any> | undefined;

	// --- SkillExpansion (Step 2) ---
	emitError: ExtensionRunner["emitError"];

	// --- ModelControl (Step 3) ---
	readonly scopedModels: ReadonlyArray<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;

	// --- TreeNavigation (Step 4) ---
	get branchSummaryAbortController(): AbortController | undefined;
	set branchSummaryAbortController(v: AbortController | undefined);
	getRequiredRequestAuth(
		model: Model<any>,
	): Promise<{ apiKey: string; headers?: Record<string, string>; env?: Record<string, string> }>;
}
