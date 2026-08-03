import type { AgentState, StreamFn } from "@tsuuanmi/pi-agent";
import type { Model, ThinkingLevel } from "@tsuuanmi/pi-ai";
import type { ModelRegistry } from "#pi/loader/model-registry";
import type { ResourceLoader } from "#pi/loader/resources";
import type { ExtensionRunner } from "#pi/package-manager/extensions/index";
import type { AgentSessionEvent } from "#pi/runtime/agent-session";
import type { SessionManager } from "#pi/session/manager";
import type { SettingsManager } from "#pi/settings/settings-manager";

/**
 * Type-only seam for Pi session runtime helpers.
 *
 * Helpers receive only the state they need instead of the whole AgentSession,
 * keeping runtime orchestration in `pi-session.ts` and preventing helper modules
 * from reaching core-loop controls such as abort, prompt, steer, or follow-up.
 *
 * The `AgentSession._ctx()` getter must allocate a fresh object on every call
 * so live field values are read at call time. Do not cache this context.
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
