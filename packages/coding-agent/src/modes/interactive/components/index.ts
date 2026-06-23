// UI Components for extensions

export { type RenderDiffOptions, renderDiff } from "../../../ui/rendering/diff.ts";
export { keyHint, keyText, rawKeyHint } from "../../../ui/rendering/keybinding-hints.ts";
export { truncateToVisualLines, type VisualTruncateResult } from "../../../ui/rendering/visual-truncate.ts";
export type { AccountSelectorOption } from "./account-selector.ts";
export { AssistantMessageComponent } from "./assistant-message.ts";
export { BashExecutionComponent } from "./bash-execution.ts";
export { BorderedLoader } from "./bordered-loader.ts";
export { BranchSummaryMessageComponent } from "./branch-summary-message.ts";
export { CompactionSummaryMessageComponent } from "./compaction-summary-message.ts";
export { CustomEditor } from "./custom-editor.ts";
export { CustomMessageComponent } from "./custom-message.ts";
export { DynamicBorder } from "./dynamic-border.ts";
export { ExtensionEditorComponent } from "./extension-editor.ts";
export { ExtensionInputComponent } from "./extension-input.ts";
export { ExtensionSelectorComponent } from "./extension-selector.ts";
export type {
	FirstTimeSetupOptions,
	FirstTimeSetupResult,
} from "./first-time-setup.ts";
export { LoginDialogComponent } from "./login-dialog.ts";
export { ModelSelectorComponent } from "./model-selector.ts";
export { OAuthSelectorComponent } from "./oauth-selector.ts";
export { SessionSelectorComponent } from "./session-selector.ts";
export { type SettingsCallbacks, type SettingsConfig, SettingsSelectorComponent } from "./settings-selector.ts";
export { SkillInvocationMessageComponent } from "./skill-invocation-message.ts";
/** @deprecated Use `StatusLineComponent`. Constructor signature changed to `(session, footerData, settingsManager, requestRender)`. */
export { StatusLineComponent, StatusLineComponent as FooterComponent } from "./status-line/index.ts";
export { ThemeSelectorComponent } from "./theme-selector.ts";
export { ThinkingSelectorComponent } from "./thinking-selector.ts";
export { ToolExecutionComponent, type ToolExecutionOptions } from "./tool-execution.ts";
export { TreeSelectorComponent } from "./tree-selector.ts";
export { UserMessageComponent } from "./user-message.ts";
export { UserMessageSelectorComponent } from "./user-message-selector.ts";
