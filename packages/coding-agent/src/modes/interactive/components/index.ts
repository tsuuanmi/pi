// UI Components for extensions

export { type RenderDiffOptions, renderDiff } from "../../../ui/rendering/diff.ts";
export { keyHint, keyText, rawKeyHint } from "../../../ui/rendering/keybinding-hints.ts";
export { truncateToVisualLines, type VisualTruncateResult } from "../../../ui/rendering/visual-truncate.ts";
export { BashExecutionComponent } from "./bash-execution.ts";
export { CustomEditor } from "./custom-editor.ts";
export { ExtensionEditorComponent } from "./extension-editor.ts";
export { ExtensionInputComponent } from "./extension-input.ts";
export { LoginDialogComponent } from "./login-dialog.ts";
export { AssistantMessageComponent } from "./messages/assistant-message.ts";
export { BranchSummaryMessageComponent } from "./messages/branch-summary-message.ts";
export { CompactionSummaryMessageComponent } from "./messages/compaction-summary-message.ts";
export { CustomMessageComponent } from "./messages/custom-message.ts";
export { SkillInvocationMessageComponent } from "./messages/skill-invocation-message.ts";
export { UserMessageComponent } from "./messages/user-message.ts";
export type { AccountSelectorOption } from "./selectors/account-selector.ts";
export { ExtensionSelectorComponent } from "./selectors/extension-selector.ts";
export { ModelSelectorComponent } from "./selectors/model-selector.ts";
export { OAuthSelectorComponent } from "./selectors/oauth-selector.ts";
export { SessionSelectorComponent } from "./selectors/session-selector.ts";
export {
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
} from "./selectors/settings-selector.ts";
export { ThemeSelectorComponent } from "./selectors/theme-selector.ts";
export { ThinkingSelectorComponent } from "./selectors/thinking-selector.ts";
export { TreeSelectorComponent } from "./selectors/tree-selector.ts";
export { UserMessageSelectorComponent } from "./selectors/user-message-selector.ts";
/** @deprecated Use `StatusLineComponent`. Constructor signature changed to `(session, footerData, settingsManager, requestRender)`. */
export { StatusLineComponent, StatusLineComponent as FooterComponent } from "./status-line/index.ts";
export { ToolExecutionComponent, type ToolExecutionOptions } from "./tool-execution.ts";
export { BorderedLoader } from "./widgets/bordered-loader.ts";
export { DynamicBorder } from "./widgets/dynamic-border.ts";
