// Extracted from InteractiveMode (Phase-2 structural split, zero behavior change).
// Selector UI surface. Moved method bodies are verbatim; injected host dependencies are
// exposed as same-named fields/getters/delegates so the bodies need no internal remaps.

import type { Component, EditorComponent } from "@tsuuanmi/pi-tui";
import { type Container, Loader, Spacer, type TUI } from "@tsuuanmi/pi-tui";
import type { AgentSession } from "../../../core/agent-session/agent-session.ts";
import type { AgentSessionRuntime } from "../../../core/agent-session/agent-session-runtime.ts";
import { configureHttpDispatcher, formatHttpIdleTimeoutMs } from "../../../core/exec/http-dispatcher.ts";
import type { ExtensionCommandContext, ProjectTrustContext } from "../../../core/extensions/index.ts";
import { MissingSessionCwdError } from "../../../core/session/session-cwd.ts";
import { SessionManager } from "../../../core/session/session-manager.ts";
import type { KeybindingsManager } from "../../../core/settings/keybindings.ts";
import type { SettingsManager } from "../../../core/settings/settings-manager.ts";
import { ProjectTrustStore } from "../../../core/trust/trust-manager.ts";
import { getAvailableThemes, setTheme, theme } from "../../../theme/theme.ts";
import { keyText } from "../../../ui/rendering/keybinding-hints.ts";
import { AssistantMessageComponent } from "../components/assistant-message.ts";
import type { CustomEditor } from "../components/custom-editor.ts";
import { SessionSelectorComponent } from "../components/session-selector.ts";
import { SettingsSelectorComponent } from "../components/settings-selector.ts";
import type { StatusLineComponent } from "../components/status-line/index.ts";
import { TreeSelectorComponent } from "../components/tree-selector.ts";
import { TrustSelectorComponent } from "../components/trust-selector.ts";
import { UserMessageSelectorComponent } from "../components/user-message-selector.ts";
import type { AccountAuthController } from "./account-auth-controller.ts";
import type { ExtensionUIController } from "./extension-ui-controller.ts";

type SelectorControllerDependencies = {
	ui: TUI;
	editorContainer: Container;
	chatContainer: Container;
	keybindings: KeybindingsManager;
	getSession: () => AgentSession;
	getSessionManager: () => SessionManager;
	getEditor: () => EditorComponent;
	getDefaultEditor: () => CustomEditor;
	getStatusContainer: () => Container;
	runtimeHost: AgentSessionRuntime;
	getFooter: () => StatusLineComponent;
	getSettingsManager: () => SettingsManager;
	getLoadingAnimation: () => Loader | undefined;
	setLoadingAnimation: (loadingAnimation: Loader | undefined) => void;
	getHideThinkingBlock: () => boolean;
	setHideThinkingBlock: (hideThinkingBlock: boolean) => void;
	_extensionUIController: ExtensionUIController;
	_accountAuthController: AccountAuthController;
	showStatus: (message: string) => void;
	showError: (errorMessage: string) => void;
	showWarning: (warningMessage: string) => void;
	renderCurrentSessionState: () => void;
	renderInitialMessages: () => void;
	flushCompactionQueue: (options?: { willRetry?: boolean }) => Promise<void>;
	handleFatalRuntimeError: (prefix: string, error: unknown) => Promise<never>;
	createProjectTrustContext: (cwd: string) => ProjectTrustContext;
	promptForMissingSessionCwd: (error: MissingSessionCwdError) => Promise<string | undefined>;
	rebuildChatFromMessages: () => void;
	updateEditorBorderColor: () => void;
	setupAutocompleteProvider: () => void;
	refreshCodexUsageSummary: (force?: boolean) => Promise<void>;
	maybeWarnAboutAnthropicSubscriptionAuth: (model?: AgentSession["model"]) => Promise<void>;
	shutdown: () => Promise<void>;
};

export class SelectorController {
	private readonly ui: TUI;
	private readonly editorContainer: Container;
	private readonly chatContainer: Container;
	private readonly keybindings: KeybindingsManager;
	private readonly getSession: () => AgentSession;
	private readonly getSessionManager: () => SessionManager;
	private readonly getEditor: () => EditorComponent;
	private readonly getDefaultEditor: () => CustomEditor;
	private readonly getStatusContainer: () => Container;
	private readonly runtimeHost: AgentSessionRuntime;
	private readonly getFooter: () => StatusLineComponent;
	private readonly getSettingsManager: () => SettingsManager;
	private readonly getLoadingAnimation: () => Loader | undefined;
	private readonly setLoadingAnimation: (loadingAnimation: Loader | undefined) => void;
	private readonly getHideThinkingBlock: () => boolean;
	private readonly setHideThinkingBlock: (hideThinkingBlock: boolean) => void;
	private readonly _extensionUIController: ExtensionUIController;
	private readonly _accountAuthController: AccountAuthController;
	private readonly showStatus: (message: string) => void;
	private readonly showError: (errorMessage: string) => void;
	private readonly showWarning: (warningMessage: string) => void;
	private readonly renderCurrentSessionState: () => void;
	private readonly renderInitialMessages: () => void;
	private readonly flushCompactionQueue: (options?: { willRetry?: boolean }) => Promise<void>;
	private readonly handleFatalRuntimeError: (prefix: string, error: unknown) => Promise<never>;
	private readonly createProjectTrustContext: (cwd: string) => ProjectTrustContext;
	private readonly promptForMissingSessionCwd: (error: MissingSessionCwdError) => Promise<string | undefined>;
	private readonly rebuildChatFromMessages: () => void;
	private readonly updateEditorBorderColor: () => void;
	private readonly setupAutocompleteProvider: () => void;
	private readonly refreshCodexUsageSummary: (force?: boolean) => Promise<void>;
	private readonly maybeWarnAboutAnthropicSubscriptionAuth: (model?: AgentSession["model"]) => Promise<void>;
	private readonly shutdown: () => Promise<void>;

	constructor(deps: SelectorControllerDependencies) {
		this.ui = deps.ui;
		this.editorContainer = deps.editorContainer;
		this.chatContainer = deps.chatContainer;
		this.keybindings = deps.keybindings;
		this.getSession = deps.getSession;
		this.getSessionManager = deps.getSessionManager;
		this.getEditor = deps.getEditor;
		this.getDefaultEditor = deps.getDefaultEditor;
		this.getStatusContainer = deps.getStatusContainer;
		this.runtimeHost = deps.runtimeHost;
		this.getFooter = deps.getFooter;
		this.getSettingsManager = deps.getSettingsManager;
		this.getLoadingAnimation = deps.getLoadingAnimation;
		this.setLoadingAnimation = deps.setLoadingAnimation;
		this.getHideThinkingBlock = deps.getHideThinkingBlock;
		this.setHideThinkingBlock = deps.setHideThinkingBlock;
		this._extensionUIController = deps._extensionUIController;
		this._accountAuthController = deps._accountAuthController;
		this.showStatus = deps.showStatus;
		this.showError = deps.showError;
		this.showWarning = deps.showWarning;
		this.renderCurrentSessionState = deps.renderCurrentSessionState;
		this.renderInitialMessages = deps.renderInitialMessages;
		this.flushCompactionQueue = deps.flushCompactionQueue;
		this.handleFatalRuntimeError = deps.handleFatalRuntimeError;
		this.createProjectTrustContext = deps.createProjectTrustContext;
		this.promptForMissingSessionCwd = deps.promptForMissingSessionCwd;
		this.rebuildChatFromMessages = deps.rebuildChatFromMessages;
		this.updateEditorBorderColor = deps.updateEditorBorderColor;
		this.setupAutocompleteProvider = deps.setupAutocompleteProvider;
		this.refreshCodexUsageSummary = deps.refreshCodexUsageSummary;
		this.maybeWarnAboutAnthropicSubscriptionAuth = deps.maybeWarnAboutAnthropicSubscriptionAuth;
		this.shutdown = deps.shutdown;
	}

	private get session(): AgentSession {
		return this.getSession();
	}
	private get sessionManager(): SessionManager {
		return this.getSessionManager();
	}
	private get editor(): EditorComponent {
		return this.getEditor();
	}
	private get defaultEditor(): CustomEditor {
		return this.getDefaultEditor();
	}
	private get statusContainer(): Container {
		return this.getStatusContainer();
	}
	private get footer(): StatusLineComponent {
		return this.getFooter();
	}
	private get settingsManager(): SettingsManager {
		return this.getSettingsManager();
	}
	private get loadingAnimation(): Loader | undefined {
		return this.getLoadingAnimation();
	}
	private set loadingAnimation(loadingAnimation: Loader | undefined) {
		this.setLoadingAnimation(loadingAnimation);
	}
	private get hideThinkingBlock(): boolean {
		return this.getHideThinkingBlock();
	}
	private set hideThinkingBlock(hideThinkingBlock: boolean) {
		this.setHideThinkingBlock(hideThinkingBlock);
	}

	/**
	 * Shows a selector component in place of the editor.
	 * @param create Factory that receives a `done` callback and returns the component and focus target
	 */
	showSelector(create: (done: () => void) => { component: Component; focus: Component }): void {
		const done = () => {
			this.editorContainer.clear();
			this.editorContainer.addChild(this.editor);
			this.ui.setFocus(this.editor);
		};
		const { component, focus } = create(done);
		this.editorContainer.clear();
		this.editorContainer.addChild(component);
		this.ui.setFocus(focus);
		this.ui.requestRender();
	}

	showSettingsSelector(): void {
		const agentProfiles = this.session.resourceLoader
			.getAgentProfiles()
			.profiles.map((profile) => ({
				name: profile.name,
				description: profile.description,
				model: profile.model,
				thinkingLevel: profile.thinkingLevel,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
		const mainModel = this.session.model ? `${this.session.model.provider}/${this.session.model.id}` : "";
		const agentModelOptions = this.session.modelRegistry
			.getAll()
			.map((model) => ({
				value: `${model.provider}/${model.id}`,
				label: `${model.provider}/${model.id}`,
				description: model.name,
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
		this.showSelector((done) => {
			const selector = new SettingsSelectorComponent(
				{
					autoCompact: this.session.autoCompactionEnabled,
					enableSkillCommands: this.settingsManager.getEnableSkillCommands(),
					steeringMode: this.session.steeringMode,
					followUpMode: this.session.followUpMode,
					transport: this.settingsManager.getTransport(),
					httpIdleTimeoutMs: this.settingsManager.getHttpIdleTimeoutMs(),
					mainModel,
					thinkingLevel: this.session.thinkingLevel,
					availableThinkingLevels: this.session.getAvailableThinkingLevels(),
					currentTheme: this.settingsManager.getTheme() || "dark",
					availableThemes: getAvailableThemes(),
					hideThinkingBlock: this.hideThinkingBlock,
					collapseChangelog: this.settingsManager.getCollapseChangelog(),
					doubleEscapeAction: this.settingsManager.getDoubleEscapeAction(),
					treeFilterMode: this.settingsManager.getTreeFilterMode(),
					showHardwareCursor: this.settingsManager.getShowHardwareCursor(),
					defaultProjectTrust: this.settingsManager.getDefaultProjectTrust(),
					editorPaddingX: this.settingsManager.getEditorPaddingX(),
					autocompleteMaxVisible: this.settingsManager.getAutocompleteMaxVisible(),
					quietStartup: this.settingsManager.getQuietStartup(),
					clearOnShrink: this.settingsManager.getClearOnShrink(),
					showTerminalProgress: this.settingsManager.getShowTerminalProgress(),
					warnings: this.settingsManager.getWarnings(),
					agentProfiles,
					agentModelOverrides: this.settingsManager.getAgentModelOverrides(),
					agentThinkingLevelOverrides: this.settingsManager.getAgentThinkingLevelOverrides(),
					agentModelOptions,
				},
				{
					onAutoCompactChange: (enabled) => {
						this.session.setAutoCompactionEnabled(enabled);
						this.footer.setAutoCompactEnabled(enabled);
					},
					onEnableSkillCommandsChange: (enabled) => {
						this.settingsManager.setEnableSkillCommands(enabled);
						this.setupAutocompleteProvider();
					},
					onSteeringModeChange: (mode) => {
						this.session.setSteeringMode(mode);
					},
					onFollowUpModeChange: (mode) => {
						this.session.setFollowUpMode(mode);
					},
					onTransportChange: (transport) => {
						this.settingsManager.setTransport(transport);
						this.session.agent.transport = transport;
					},
					onHttpIdleTimeoutMsChange: (timeoutMs) => {
						this.settingsManager.setHttpIdleTimeoutMs(timeoutMs);
						configureHttpDispatcher(timeoutMs);
						this.showStatus(`HTTP idle timeout: ${formatHttpIdleTimeoutMs(timeoutMs)}`);
					},
					onThinkingLevelChange: (level) => {
						this.session.setThinkingLevel(level);
						this.footer.invalidate();
						this.updateEditorBorderColor();
					},
					onThemeChange: (themeName) => {
						const result = setTheme(themeName, true);
						this.settingsManager.setTheme(themeName);
						this.ui.invalidate();
						if (!result.success) {
							this.showError(`Failed to load theme "${themeName}": ${result.error}\nFell back to dark theme.`);
						}
					},
					onThemePreview: (themeName) => {
						const result = setTheme(themeName, true);
						if (result.success) {
							this.ui.invalidate();
							this.ui.requestRender();
						}
					},
					onHideThinkingBlockChange: (hidden) => {
						this.hideThinkingBlock = hidden;
						this.settingsManager.setHideThinkingBlock(hidden);
						for (const child of this.chatContainer.children) {
							if (child instanceof AssistantMessageComponent) {
								child.setHideThinkingBlock(hidden);
							}
						}
						this.chatContainer.clear();
						this.rebuildChatFromMessages();
					},
					onCollapseChangelogChange: (collapsed) => {
						this.settingsManager.setCollapseChangelog(collapsed);
					},
					onQuietStartupChange: (enabled) => {
						this.settingsManager.setQuietStartup(enabled);
					},
					onDefaultProjectTrustChange: (defaultProjectTrust) => {
						this.settingsManager.setDefaultProjectTrust(defaultProjectTrust);
					},
					onDoubleEscapeActionChange: (action) => {
						this.settingsManager.setDoubleEscapeAction(action);
					},
					onTreeFilterModeChange: (mode) => {
						this.settingsManager.setTreeFilterMode(mode);
					},
					onShowHardwareCursorChange: (enabled) => {
						this.settingsManager.setShowHardwareCursor(enabled);
						this.ui.setShowHardwareCursor(enabled);
					},
					onEditorPaddingXChange: (padding) => {
						this.settingsManager.setEditorPaddingX(padding);
						this.defaultEditor.setPaddingX(padding);
						if (this.editor !== this.defaultEditor && this.editor.setPaddingX !== undefined) {
							this.editor.setPaddingX(padding);
						}
					},
					onAutocompleteMaxVisibleChange: (maxVisible) => {
						this.settingsManager.setAutocompleteMaxVisible(maxVisible);
						this.defaultEditor.setAutocompleteMaxVisible(maxVisible);
						if (this.editor !== this.defaultEditor && this.editor.setAutocompleteMaxVisible !== undefined) {
							this.editor.setAutocompleteMaxVisible(maxVisible);
						}
					},
					onClearOnShrinkChange: (enabled) => {
						this.settingsManager.setClearOnShrink(enabled);
						this.ui.setClearOnShrink(enabled);
					},
					onShowTerminalProgressChange: (enabled) => {
						this.settingsManager.setShowTerminalProgress(enabled);
					},
					onWarningsChange: (warnings) => {
						this.settingsManager.setWarnings(warnings);
					},
					onMainModelChange: (modelRef) => {
						const [provider, ...modelParts] = modelRef.split("/");
						const modelId = modelParts.join("/");
						const model = provider && modelId ? this.session.modelRegistry.find(provider, modelId) : undefined;
						if (!model) {
							this.showError(`Model not found: ${modelRef}`);
							return;
						}
						void (async () => {
							try {
								this.settingsManager.setDefaultModelAndProvider(model.provider, model.id);
								await this.session.setModel(model);
								this.footer.invalidate();
								this.updateEditorBorderColor();
								void this._accountAuthController.refreshCodexUsageSummary(true);
								this.showStatus(`Model: ${model.id}`);
								void this._accountAuthController.maybeWarnAboutAnthropicSubscriptionAuth(model);
							} catch (error) {
								this.showError(error instanceof Error ? error.message : String(error));
							}
						})();
					},
					onAgentModelOverrideChange: (agentName, modelRef) => {
						this.settingsManager.setAgentModelOverride(agentName, modelRef);
					},
					onAgentThinkingLevelOverrideChange: (agentName, level) => {
						this.settingsManager.setAgentThinkingLevelOverride(agentName, level);
					},
					onCancel: () => {
						done();
						this.ui.requestRender();
					},
				},
			);
			return { component: selector, focus: selector.getSettingsList() };
		});
	}

	/** Update the footer's available provider count from current model candidates */

	showTrustSelector(): void {
		const cwd = this.sessionManager.getCwd();
		const trustStore = new ProjectTrustStore(this.runtimeHost.services.agentDir);
		const savedDecision = trustStore.getEntry(cwd);
		this.showSelector((done) => {
			const selector = new TrustSelectorComponent({
				cwd,
				savedDecision,
				projectTrusted: this.settingsManager.isProjectTrusted(),
				onSelect: (selection) => {
					trustStore.setMany(selection.updates);
					done();
					this.showStatus(
						`Saved trust decision: ${selection.trusted ? "trusted" : "untrusted"}. Restart pi for this to take effect.`,
					);
				},
				onCancel: () => {
					done();
					this.ui.requestRender();
				},
			});
			return { component: selector, focus: selector };
		});
	}

	showUserMessageSelector(): void {
		const userMessages = this.session.getUserMessagesForForking();

		if (userMessages.length === 0) {
			this.showStatus("No messages to fork from");
			return;
		}

		const initialSelectedId = userMessages[userMessages.length - 1]?.entryId;

		this.showSelector((done) => {
			const selector = new UserMessageSelectorComponent(
				userMessages.map((m) => ({ id: m.entryId, text: m.text })),
				async (entryId) => {
					try {
						const result = await this.runtimeHost.fork(entryId);
						if (result.cancelled) {
							done();
							this.ui.requestRender();
							return;
						}

						this.renderCurrentSessionState();
						this.editor.setText(result.selectedText ?? "");
						done();
						this.showStatus("Forked to new session");
					} catch (error: unknown) {
						done();
						this.showError(error instanceof Error ? error.message : String(error));
					}
				},
				() => {
					done();
					this.ui.requestRender();
				},
				initialSelectedId,
			);
			return { component: selector, focus: selector.getMessageList() };
		});
	}

	showTreeSelector(initialSelectedId?: string): void {
		const tree = this.sessionManager.getTree();
		const realLeafId = this.sessionManager.getLeafId();
		const initialFilterMode = this.settingsManager.getTreeFilterMode();

		if (tree.length === 0) {
			this.showStatus("No entries in session");
			return;
		}

		this.showSelector((done) => {
			const selector = new TreeSelectorComponent(
				tree,
				realLeafId,
				this.ui.terminal.rows,
				async (entryId) => {
					// Selecting the current leaf is a no-op (already there)
					if (entryId === realLeafId) {
						done();
						this.showStatus("Already at this point");
						return;
					}

					// Ask about summarization
					done(); // Close selector first

					// Loop until user makes a complete choice or cancels to tree
					let wantsSummary = false;
					let customInstructions: string | undefined;

					// Check if we should skip the prompt (user preference to always default to no summary)
					if (!this.settingsManager.getBranchSummarySkipPrompt()) {
						while (true) {
							const summaryChoice = await this._extensionUIController.showExtensionSelector(
								"Summarize branch?",
								["No summary", "Summarize", "Summarize with custom prompt"],
							);

							if (summaryChoice === undefined) {
								// User pressed escape - re-show tree selector with same selection
								this.showTreeSelector(entryId);
								return;
							}

							wantsSummary = summaryChoice !== "No summary";

							if (summaryChoice === "Summarize with custom prompt") {
								customInstructions = await this._extensionUIController.showExtensionEditor(
									"Custom summarization instructions",
								);
								if (customInstructions === undefined) {
									// User cancelled - loop back to summary selector
									continue;
								}
							}

							// User made a complete choice
							break;
						}
					}

					// Set up escape handler and loader if summarizing
					let summaryLoader: Loader | undefined;
					const originalOnEscape = this.defaultEditor.onEscape;

					if (wantsSummary) {
						this.defaultEditor.onEscape = () => {
							this.session.abortBranchSummary();
						};
						this.chatContainer.addChild(new Spacer(1));
						summaryLoader = new Loader(
							this.ui,
							(spinner) => theme.fg("accent", spinner),
							(text) => theme.fg("muted", text),
							`Summarizing branch... (${keyText("app.interrupt")} to cancel)`,
						);
						this.statusContainer.addChild(summaryLoader);
						this.ui.requestRender();
					}

					try {
						const result = await this.session.navigateTree(entryId, {
							summarize: wantsSummary,
							customInstructions,
						});

						if (result.aborted) {
							// Summarization aborted - re-show tree selector with same selection
							this.showStatus("Branch summarization cancelled");
							this.showTreeSelector(entryId);
							return;
						}
						if (result.cancelled) {
							this.showStatus("Navigation cancelled");
							return;
						}

						// Update UI
						this.chatContainer.clear();
						this.renderInitialMessages();
						if (result.editorText && !this.editor.getText().trim()) {
							this.editor.setText(result.editorText);
						}
						this.showStatus("Navigated to selected point");
						void this.flushCompactionQueue({ willRetry: false });
					} catch (error) {
						this.showError(error instanceof Error ? error.message : String(error));
					} finally {
						if (summaryLoader) {
							summaryLoader.stop();
							this.statusContainer.clear();
						}
						this.defaultEditor.onEscape = originalOnEscape;
					}
				},
				() => {
					done();
					this.ui.requestRender();
				},
				(entryId, label) => {
					this.sessionManager.appendLabelChange(entryId, label);
					this.ui.requestRender();
				},
				initialSelectedId,
				initialFilterMode,
			);
			return { component: selector, focus: selector };
		});
	}

	showSessionSelector(): void {
		this.showSelector((done) => {
			const selector = new SessionSelectorComponent(
				(onProgress) =>
					SessionManager.list(this.sessionManager.getCwd(), this.sessionManager.getSessionDir(), onProgress),
				(onProgress) =>
					this.sessionManager.usesDefaultSessionDir()
						? SessionManager.listAll(onProgress)
						: SessionManager.listAll(this.sessionManager.getSessionDir(), onProgress),
				async (sessionPath) => {
					done();
					await this.handleResumeSession(sessionPath);
				},
				() => {
					done();
					this.ui.requestRender();
				},
				() => {
					void this.shutdown();
				},
				() => this.ui.requestRender(),
				{
					renameSession: async (sessionFilePath: string, nextName: string | undefined) => {
						const next = (nextName ?? "").trim();
						if (!next) return;
						const mgr = SessionManager.open(sessionFilePath);
						mgr.appendSessionInfo(next);
					},
					showRenameHint: true,
					keybindings: this.keybindings,
				},

				this.sessionManager.getSessionFile(),
			);
			return { component: selector, focus: selector };
		});
	}

	async handleResumeSession(
		sessionPath: string,
		options?: Parameters<ExtensionCommandContext["switchSession"]>[1],
	): Promise<{ cancelled: boolean }> {
		if (this.loadingAnimation) {
			this.loadingAnimation.stop();
			this.loadingAnimation = undefined;
		}
		this.statusContainer.clear();
		try {
			const result = await this.runtimeHost.switchSession(sessionPath, {
				withSession: options?.withSession,
				projectTrustContextFactory: (cwd) => this.createProjectTrustContext(cwd),
			});
			if (result.cancelled) {
				return result;
			}
			this.renderCurrentSessionState();
			this.showStatus("Resumed session");
			return result;
		} catch (error: unknown) {
			if (error instanceof MissingSessionCwdError) {
				const selectedCwd = await this.promptForMissingSessionCwd(error);
				if (!selectedCwd) {
					this.showStatus("Resume cancelled");
					return { cancelled: true };
				}
				const result = await this.runtimeHost.switchSession(sessionPath, {
					cwdOverride: selectedCwd,
					withSession: options?.withSession,
					projectTrustContextFactory: (cwd) => this.createProjectTrustContext(cwd),
				});
				if (result.cancelled) {
					return result;
				}
				this.renderCurrentSessionState();
				this.showStatus("Resumed session in current cwd");
				return result;
			}
			return this.handleFatalRuntimeError("Failed to resume session", error);
		}
	}
}
