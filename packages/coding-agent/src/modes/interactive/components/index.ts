// UI Components for extensions

export { BashExecutionComponent } from "#coding-agent/modes/interactive/components/bash-execution";
export { CustomEditor } from "#coding-agent/modes/interactive/components/custom-editor";
export { ExtensionEditorComponent } from "#coding-agent/modes/interactive/components/extension-editor";
export { ExtensionInputComponent } from "#coding-agent/modes/interactive/components/extension-input";
export { LoginDialogComponent } from "#coding-agent/modes/interactive/components/login-dialog";
export { AssistantMessageComponent } from "#coding-agent/modes/interactive/components/messages/assistant-message";
export { BranchSummaryMessageComponent } from "#coding-agent/modes/interactive/components/messages/branch-summary-message";
export { CompactionSummaryMessageComponent } from "#coding-agent/modes/interactive/components/messages/compaction-summary-message";
export { CustomMessageComponent } from "#coding-agent/modes/interactive/components/messages/custom-message";
export { SkillInvocationMessageComponent } from "#coding-agent/modes/interactive/components/messages/skill-invocation-message";
export { UserMessageComponent } from "#coding-agent/modes/interactive/components/messages/user-message";
export type { AccountSelectorOption } from "#coding-agent/modes/interactive/components/selectors/account-selector";
export { ExtensionSelectorComponent } from "#coding-agent/modes/interactive/components/selectors/extension-selector";
export { ModelSelectorComponent } from "#coding-agent/modes/interactive/components/selectors/model-selector";
export { OAuthSelectorComponent } from "#coding-agent/modes/interactive/components/selectors/oauth-selector";
export { SessionSelectorComponent } from "#coding-agent/modes/interactive/components/selectors/session-selector";
export {
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
} from "#coding-agent/modes/interactive/components/selectors/settings-selector";
export { ThemeSelectorComponent } from "#coding-agent/modes/interactive/components/selectors/theme-selector";
export { ThinkingSelectorComponent } from "#coding-agent/modes/interactive/components/selectors/thinking-selector";
export { TreeSelectorComponent } from "#coding-agent/modes/interactive/components/selectors/tree-selector";
export { UserMessageSelectorComponent } from "#coding-agent/modes/interactive/components/selectors/user-message-selector";
/** @deprecated Use `StatusLineComponent`. Constructor signature changed to `(session, footerData, settingsManager, requestRender)`. */
export {
	StatusLineComponent,
	StatusLineComponent as FooterComponent,
} from "#coding-agent/modes/interactive/components/status-line/index";
export {
	ToolExecutionComponent,
	type ToolExecutionOptions,
} from "#coding-agent/modes/interactive/components/tool-execution";
export { BorderedLoader } from "#coding-agent/modes/interactive/components/widgets/bordered-loader";
export { DynamicBorder } from "#coding-agent/modes/interactive/components/widgets/dynamic-border";
export { type RenderDiffOptions, renderDiff } from "#coding-agent/ui/rendering/diff";
export { keyHint, keyText, rawKeyHint } from "#coding-agent/ui/rendering/keybinding-hints";
export { truncateToVisualLines, type VisualTruncateResult } from "#coding-agent/ui/rendering/visual-truncate";
