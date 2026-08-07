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
export { formatSkillsForPrompt } from "#pi/agent/system-prompt";
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
// Loader exports
export { CONFIG_DIR_NAME, VERSION } from "#pi/loader/app";
export { loadProjectContextFiles } from "#pi/loader/context";
export { discoverAndLoadExtensions } from "#pi/loader/extensions";
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
export { DefaultPackageManager } from "#pi/package-manager/package-manager";
export type { PackageManager, ProgressCallback, ProgressEvent } from "#pi/package-manager/types";
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
} from "#pi/session/compaction";
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
export {
	type CompactionSettings,
	type PackageSource,
	type RetrySettings,
	SettingsManager,
	type SettingsManagerCreateOptions,
} from "#pi/settings/settings-manager";
export { SubagentManager } from "#pi/subagents/manager";
// Tools
export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLocalBash,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
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
} from "#pi/tools/default-tools";
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
