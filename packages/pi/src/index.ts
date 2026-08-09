// Core session management

// Theme utilities for custom tools and extensions
export {
	getLanguageFromPath,
	getMarkdownTheme,
	getSelectListTheme,
	getSettingsListTheme,
	highlightCode,
	initTheme,
	Theme,
	type ThemeColor,
} from "@tsuuanmi/pi-tui";
// Footer data provider (git branch + extension statuses - data not otherwise available to extensions)
export type { ReadonlyFooterDataProvider } from "#pi/api/ui-types";
// Auth and model registry
export {
	type ApiKeyCredential,
	type AuthCredential,
	type AuthStatus,
	AuthStorage,
	type AuthStorageBackend,
	FileAuthStorageBackend,
	InMemoryAuthStorageBackend,
	type OAuthCredential,
} from "#pi/auth/storage";
export { type Args, parseArgs } from "#pi/cli/args";
// Shell utilities
export { resolveShell } from "#pi/execution/shell";
export { formatSkillsForPrompt } from "#pi/loader/agents/system-prompt";
// Loader exports
export { CONFIG_DIR_NAME, VERSION } from "#pi/loader/app";
export { loadProjectContextFiles } from "#pi/loader/context";
export { discoverAndLoadExtensions } from "#pi/loader/extensions/loader";
export { parseFrontmatter, stripFrontmatter } from "#pi/loader/frontmatter";
export { getDocsPath, getPackageDir, getReadmePath } from "#pi/loader/package";
export { getAgentDir } from "#pi/loader/paths";
export type { ResourceCollision, ResourceDiagnostic, ResourceLoader } from "#pi/loader/resources";
export { DefaultResourceLoader } from "#pi/loader/resources";
// Skills
export {
	type LoadSkillsFromDirOptions,
	type LoadSkillsResult,
	loadSkills,
	loadSkillsFromDir,
	type Skill,
	type SkillFrontmatter,
} from "#pi/loader/skill";
// Main entry point
export { type MainOptions, main } from "#pi/main";
// Run modes for programmatic SDK usage
export {
	InteractiveMode,
	type InteractiveModeOptions,
	type ModelInfo,
	type PrintModeOptions,
	RpcClient,
	type RpcClientOptions,
	type RpcCommand,
	type RpcEventListener,
	type RpcExtensionUIRequest,
	type RpcExtensionUIResponse,
	type RpcResponse,
	type RpcSessionState,
	runPrintMode,
	runRpcMode,
} from "#pi/modes/index";
export { DefaultPackageManager } from "#pi/package/manager";
export type { PackageManager, ProgressCallback, ProgressEvent } from "#pi/package/types";
export { createSyntheticSourceInfo } from "#pi/resources/source-info";
export type { PathMetadata, ResolvedPaths, ResolvedResource } from "#pi/resources/types";
export { AgentSession } from "#pi/runtime/agent-session";
// SDK for programmatic usage
export {
	type CreateAgentSessionOptions,
	type CreateAgentSessionResult,
	createAgentSession,
	createBashTool,
	createCodingTools,
	createEditTool,
	createFindTool,
	createGlobTool,
	createGrepTool,
	createLspTool,
	createLsTool,
	createReadOnlyTools,
	createReadTool,
	createWriteTool,
	type PromptTemplate,
} from "#pi/runtime/agent-session-factory";
export {
	AgentSessionRuntime,
	type CreateAgentSessionRuntimeFactory,
	type CreateAgentSessionRuntimeResult,
	createAgentSessionRuntime,
} from "#pi/runtime/agent-session-runtime";
export {
	type AgentSessionRuntimeDiagnostic,
	type AgentSessionServices,
	type CreateAgentSessionFromServicesOptions,
	type CreateAgentSessionServicesOptions,
	createAgentSessionFromServices,
	createAgentSessionServices,
} from "#pi/runtime/agent-session-services";
export type { ParsedSkillBlock } from "#pi/runtime/session/skill-block";
export { parseSkillBlock } from "#pi/runtime/session/skill-block";
export type {
	AgentSessionConfig,
	AgentSessionEvent,
	AgentSessionEventListener,
	ModelCycleResult,
	PromptOptions,
	SessionStats,
} from "#pi/runtime/session/types";
export {
	type BranchPreparation,
	type BranchSummaryResult,
	type CollectEntriesResult,
	type CompactionResult,
	type CutPointResult,
	calculateContextTokens,
	collectEntriesForBranchSummary,
	compact,
	DEFAULT_COMPACTION_SETTINGS,
	estimateTokens,
	findCutPoint,
	findTurnStartIndex,
	type GenerateBranchSummaryOptions,
	generateBranchSummary,
	generateSummary,
	getLastAssistantUsage,
	prepareBranchEntries,
	shouldCompact,
} from "#pi/session/compaction/index";
export {
	type BranchSummaryEntry,
	buildSessionContext,
	type CompactionEntry,
	CURRENT_SESSION_VERSION,
	type CustomEntry,
	type CustomMessageEntry,
	type FileEntry,
	getLatestCompactionEntry,
	type ModelChangeEntry,
	migrateSessionEntries,
	type NewSessionOptions,
	parseSessionEntries,
	type SessionContext,
	type SessionEntry,
	type SessionEntryBase,
	type SessionHeader,
	type SessionInfo,
	type SessionInfoEntry,
	SessionManager,
	type SessionMessageEntry,
	type ThinkingLevelChangeEntry,
} from "#pi/session/manager";
export { SettingsManager } from "#pi/settings/manager";
export type { CompactionSettings, PackageSource, RetrySettings } from "#pi/settings/types";
export { SubagentManager } from "#pi/subagents/manager";
// Tools
export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashSpec,
	createEditSpec,
	createFindSpec,
	createGrepSpec,
	createLocalBash,
	createLsSpec,
	createReadSpec,
	createWriteSpec,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
	formatSize,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
	type ToolsOptions,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
} from "#pi/tools/index";
// UI components for extensions
export {
	AssistantMessageComponent,
	BashExecutionComponent,
	BranchSummaryMessageComponent,
	CompactionSummaryMessageComponent,
	CustomEditor,
	CustomMessageComponent,
	ExtensionEditorComponent,
	ExtensionInputComponent,
	ExtensionSelectorComponent,
	keyHint,
	keyText,
	LoginDialogComponent,
	ModelSelectorComponent,
	OAuthSelectorComponent,
	type RenderDiffOptions,
	rawKeyHint,
	renderDiff,
	SessionSelectorComponent,
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
	SkillInvocationMessageComponent,
	ThinkingSelectorComponent,
	ToolExecutionComponent,
	type ToolExecutionOptions,
	TreeSelectorComponent,
	truncateToVisualLines,
	type VisualTruncateResult,
} from "#pi/ui/interactive/components/index";
// Clipboard utilities
export { copyToClipboard } from "#pi/ui/interactive/utils/clipboard";
