import type { ThinkingLevel } from "@tsuuanmi/pi-agent";
import { getAgentDir } from "#pi/loader/paths";
import { BehaviorSettings } from "#pi/settings/behavior";
import { ModelSettings } from "#pi/settings/model";
import { ResourceSettings } from "#pi/settings/resources";
import { RuntimeSettings } from "#pi/settings/runtime";
import { FileStorage } from "#pi/settings/storage";
import { SettingsStore } from "#pi/settings/store";
import type {
	ModelProviderSettings,
	ModelsSettings,
	PackageSource,
	Settings,
	SettingsStorage,
	StatusLineSettings,
	TransportSetting,
} from "#pi/settings/types";

export type {
	ApiUsageLoggingSettings,
	BranchSummarySettings,
	CompactionSettings,
	MarkdownSettings,
	ModelProviderSettings,
	ModelsSettings,
	PackageSource,
	ProviderRetrySettings,
	RetainedContextSettings,
	RetrySettings,
	Settings,
	SettingsScope,
	SettingsStorage,
	StatusLineSettings,
	TransportSetting,
} from "#pi/settings/types";

export class SettingsManager {
	private readonly models: ModelSettings;
	private readonly runtime: RuntimeSettings;
	private readonly resources: ResourceSettings;
	private readonly behavior: BehaviorSettings;
	private readonly store: SettingsStore;

	private constructor(store: SettingsStore) {
		this.store = store;
		this.models = new ModelSettings(store);
		this.runtime = new RuntimeSettings(store);
		this.resources = new ResourceSettings(store);
		this.behavior = new BehaviorSettings(store);
	}

	static create(cwd: string, agentDir: string = getAgentDir()): SettingsManager {
		return SettingsManager.fromStorage(new FileStorage(cwd, agentDir));
	}

	static fromStorage(storage: SettingsStorage): SettingsManager {
		return new SettingsManager(SettingsStore.fromStorage(storage));
	}

	static inMemory(settings: Partial<Settings> = {}): SettingsManager {
		return new SettingsManager(SettingsStore.inMemory(settings));
	}

	getGlobalSettings(): Settings {
		return this.store.getGlobalSettings();
	}

	getProjectSettings(): Settings {
		return this.store.getProjectSettings();
	}

	reload(): void {
		this.store.reload();
	}

	applyOverrides(overrides: Partial<Settings>): void {
		this.store.applyOverrides(overrides);
	}

	getSessionDir(): string | undefined {
		return this.runtime.getSessionDir();
	}

	getModelsConfig(): ModelsSettings | undefined {
		return this.models.getModelsConfig();
	}

	upsertModelProvider(providerId: string, provider: ModelProviderSettings): void {
		this.models.upsertModelProvider(providerId, provider);
	}

	getDefaultProvider(): string | undefined {
		return this.models.getDefaultProvider();
	}

	getDefaultModel(): string | undefined {
		return this.models.getDefaultModel();
	}

	setDefaultProvider(provider: string): void {
		this.models.setDefaultProvider(provider);
	}

	setDefaultModel(modelId: string): void {
		this.models.setDefaultModel(modelId);
	}

	setDefaultModelAndProvider(provider: string, modelId: string): void {
		this.models.setDefaultModelAndProvider(provider, modelId);
	}

	getSteeringMode(): "all" | "one-at-a-time" {
		return this.runtime.getSteeringMode();
	}

	setSteeringMode(mode: "all" | "one-at-a-time"): void {
		this.runtime.setSteeringMode(mode);
	}

	getFollowUpMode(): "all" | "one-at-a-time" {
		return this.runtime.getFollowUpMode();
	}

	setFollowUpMode(mode: "all" | "one-at-a-time"): void {
		this.runtime.setFollowUpMode(mode);
	}

	getTheme(): string | undefined {
		return this.runtime.getTheme();
	}

	setTheme(theme: string): void {
		this.runtime.setTheme(theme);
	}

	getDefaultThinkingLevel(): ThinkingLevel | undefined {
		return this.models.getDefaultThinkingLevel();
	}

	setDefaultThinkingLevel(level: ThinkingLevel): void {
		this.models.setDefaultThinkingLevel(level);
	}

	getAgentModelOverrides(): Record<string, string> {
		return this.models.getAgentModelOverrides();
	}

	getAgentModelOverride(agentName: string): string | undefined {
		return this.models.getAgentModelOverride(agentName);
	}

	setAgentModelOverride(agentName: string, modelRef: string | undefined): void {
		this.models.setAgentModelOverride(agentName, modelRef);
	}

	getAgentThinkingLevelOverrides(): Record<string, ThinkingLevel> {
		return this.models.getAgentThinkingLevelOverrides();
	}

	getAgentThinkingLevelOverride(agentName: string): ThinkingLevel | undefined {
		return this.models.getAgentThinkingLevelOverride(agentName);
	}

	setAgentThinkingLevelOverride(agentName: string, level: ThinkingLevel | undefined): void {
		this.models.setAgentThinkingLevelOverride(agentName, level);
	}

	getTransport(): TransportSetting {
		return this.runtime.getTransport();
	}

	setTransport(transport: TransportSetting): void {
		this.runtime.setTransport(transport);
	}

	getCompactionEnabled(): boolean {
		return this.behavior.getCompactionEnabled();
	}

	setCompactionEnabled(enabled: boolean): void {
		this.behavior.setCompactionEnabled(enabled);
	}

	getCompactionReserveTokens(): number {
		return this.behavior.getCompactionReserveTokens();
	}

	getCompactionKeepRecentTokens(): number {
		return this.behavior.getCompactionKeepRecentTokens();
	}

	getCompactionSettings(): { enabled: boolean; reserveTokens: number; keepRecentTokens: number } {
		return this.behavior.getCompactionSettings();
	}

	getBranchSummarySettings(): { reserveTokens: number; skipPrompt: boolean } {
		return this.behavior.getBranchSummarySettings();
	}

	getBranchSummarySkipPrompt(): boolean {
		return this.behavior.getBranchSummarySkipPrompt();
	}

	getRetryEnabled(): boolean {
		return this.behavior.getRetryEnabled();
	}

	setRetryEnabled(enabled: boolean): void {
		this.behavior.setRetryEnabled(enabled);
	}

	getRetrySettings(): { enabled: boolean; maxRetries: number; baseDelayMs: number } {
		return this.behavior.getRetrySettings();
	}

	getHttpIdleTimeoutMs(): number {
		return this.behavior.getHttpIdleTimeoutMs();
	}

	setHttpIdleTimeoutMs(timeoutMs: number): void {
		this.behavior.setHttpIdleTimeoutMs(timeoutMs);
	}

	getProviderRetrySettings(): { timeoutMs?: number; maxRetries?: number; maxRetryDelayMs: number } {
		return this.behavior.getProviderRetrySettings();
	}

	getWebSocketConnectTimeoutMs(): number | undefined {
		return this.behavior.getWebSocketConnectTimeoutMs();
	}

	getHideThinkingBlock(): boolean {
		return this.behavior.getHideThinkingBlock();
	}

	setHideThinkingBlock(hide: boolean): void {
		this.behavior.setHideThinkingBlock(hide);
	}

	getShellPath(): string | undefined {
		return this.runtime.getShellPath();
	}

	setShellPath(path: string | undefined): void {
		this.runtime.setShellPath(path);
	}

	getShellCommandPrefix(): string | undefined {
		return this.runtime.getShellCommandPrefix();
	}

	setShellCommandPrefix(prefix: string | undefined): void {
		this.runtime.setShellCommandPrefix(prefix);
	}

	getNpmCommand(): string[] | undefined {
		return this.runtime.getNpmCommand();
	}

	setNpmCommand(command: string[] | undefined): void {
		this.runtime.setNpmCommand(command);
	}

	getPackages(): PackageSource[] {
		return this.resources.getPackages();
	}

	setPackages(packages: PackageSource[]): void {
		this.resources.setPackages(packages);
	}

	setProjectPackages(packages: PackageSource[]): void {
		this.resources.setProjectPackages(packages);
	}

	getExtensionPaths(): string[] {
		return this.resources.getExtensionPaths();
	}

	setExtensionPaths(paths: string[]): void {
		this.resources.setExtensionPaths(paths);
	}

	setProjectExtensionPaths(paths: string[]): void {
		this.resources.setProjectExtensionPaths(paths);
	}

	getSkillPaths(): string[] {
		return this.resources.getSkillPaths();
	}

	setSkillPaths(paths: string[]): void {
		this.resources.setSkillPaths(paths);
	}

	setProjectSkillPaths(paths: string[]): void {
		this.resources.setProjectSkillPaths(paths);
	}

	getPromptTemplatePaths(): string[] {
		return this.resources.getPromptTemplatePaths();
	}

	setPromptTemplatePaths(paths: string[]): void {
		this.resources.setPromptTemplatePaths(paths);
	}

	setProjectPromptTemplatePaths(paths: string[]): void {
		this.resources.setProjectPromptTemplatePaths(paths);
	}

	getThemePaths(): string[] {
		return this.resources.getThemePaths();
	}

	setThemePaths(paths: string[]): void {
		this.resources.setThemePaths(paths);
	}

	setProjectThemePaths(paths: string[]): void {
		this.resources.setProjectThemePaths(paths);
	}

	getEnableSkillCommands(): boolean {
		return this.resources.getEnableSkillCommands();
	}

	setEnableSkillCommands(enabled: boolean): void {
		this.resources.setEnableSkillCommands(enabled);
	}

	getEnabledModels(): string[] | undefined {
		return this.resources.getEnabledModels();
	}

	setEnabledModels(patterns: string[] | undefined): void {
		this.resources.setEnabledModels(patterns);
	}

	getShowHardwareCursor(): boolean {
		return this.runtime.getShowHardwareCursor();
	}

	setShowHardwareCursor(enabled: boolean): void {
		this.runtime.setShowHardwareCursor(enabled);
	}

	getCodeBlockIndent(): string {
		return this.behavior.getCodeBlockIndent();
	}

	getApiUsageLoggingEnabled(): boolean {
		return this.behavior.getApiUsageLoggingEnabled();
	}

	getRetainedContextSettings(): {
		stripThinking: boolean;
		compressBashOutput: boolean;
		bashMaxBytes: number;
		dedupeReadResults: boolean;
		summarizeStaleToolResults: boolean;
		toolResultMaxBytes: number;
	} {
		return this.behavior.getRetainedContextSettings();
	}

	getStatusLine(): StatusLineSettings {
		return this.behavior.getStatusLine();
	}
}
