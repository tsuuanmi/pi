// Extracted from InteractiveMode (Phase-2 structural split, zero behavior change).
// Key handler setup. Moved method bodies are verbatim; controller instances and host
// dependencies are exposed under the original names used by the moved code.

import type { EditorComponent, TUI } from "@tsuuanmi/pi-tui";
import type { AgentSession } from "../../../core/agent-session/agent-session.ts";
import type { SettingsManager } from "../../../core/settings/settings-manager.ts";
import type { CustomEditor } from "../components/custom-editor.ts";
import type { AccountAuthController } from "./account-auth-controller.ts";
import type { CommandController } from "./command-controller.ts";
import type { SelectorController } from "./selector-controller.ts";

type KeyHandlerControllerDependencies = {
	ui: TUI;
	getDefaultEditor: () => CustomEditor;
	getSession: () => AgentSession;
	getEditor: () => EditorComponent;
	getSettingsManager: () => SettingsManager;
	getIsBashMode: () => boolean;
	setIsBashMode: (isBashMode: boolean) => void;
	getOnInputCallback: () => ((text: string) => void) | undefined;
	getPendingUserInputs: () => string[];
	_commandController: CommandController;
	_accountAuthController: AccountAuthController;
	_selectorController: SelectorController;
	restoreQueuedMessagesToEditor: (options?: { abort?: boolean; currentText?: string }) => number;
	updateEditorBorderColor: () => void;
	handleCtrlC: () => void;
	handleCtrlD: () => void;
	handleCtrlZ: () => void;
	cycleThinkingLevel: () => void;
	toggleToolOutputExpansion: () => void;
	toggleThinkingBlockVisibility: () => void;
	openExternalEditor: () => Promise<void>;
	handleFollowUp: () => void;
	handleDequeue: () => void;
	handleClearCommand: () => Promise<void>;
	showTreeSelector: (initialSelectedId?: string) => void;
	showUserMessageSelector: () => void;
	showSessionSelector: () => void;
	showSettingsSelector: () => void;
	showTrustSelector: () => void;
	handleImportCommand: (text: string) => Promise<void>;
	handleBashCommand: (command: string, isExcluded: boolean) => Promise<void>;
	handleCompactCommand: (customInstructions?: string) => Promise<void>;
	handleReloadCommand: () => Promise<void>;
	shutdown: () => Promise<void>;
	isExtensionCommand: (text: string) => boolean;
	queueCompactionMessage: (text: string, mode: "steer" | "followUp") => void;
	updatePendingMessagesDisplay: () => void;
	flushPendingBashComponents: () => void;
	showWarning: (warningMessage: string) => void;
};

export class KeyHandlerController {
	private readonly ui: TUI;
	private readonly getDefaultEditor: () => CustomEditor;
	private readonly getSession: () => AgentSession;
	private readonly getEditor: () => EditorComponent;
	private readonly getSettingsManager: () => SettingsManager;
	private readonly getIsBashMode: () => boolean;
	private readonly setIsBashMode: (isBashMode: boolean) => void;
	private readonly getOnInputCallback: () => ((text: string) => void) | undefined;
	private readonly getPendingUserInputs: () => string[];
	private readonly _commandController: CommandController;
	private readonly _accountAuthController: AccountAuthController;
	private readonly _selectorController: SelectorController;
	private readonly restoreQueuedMessagesToEditor: (options?: { abort?: boolean; currentText?: string }) => number;
	private readonly updateEditorBorderColor: () => void;
	private readonly handleCtrlC: () => void;
	private readonly handleCtrlD: () => void;
	private readonly handleCtrlZ: () => void;
	private readonly cycleThinkingLevel: () => void;
	private readonly toggleToolOutputExpansion: () => void;
	private readonly toggleThinkingBlockVisibility: () => void;
	private readonly openExternalEditor: () => Promise<void>;
	private readonly handleFollowUp: () => void;
	private readonly handleDequeue: () => void;
	private readonly handleClearCommand: () => Promise<void>;
	private readonly showTreeSelector: (initialSelectedId?: string) => void;
	private readonly showUserMessageSelector: () => void;
	private readonly showSessionSelector: () => void;
	private readonly showSettingsSelector: () => void;
	private readonly showTrustSelector: () => void;
	private readonly handleImportCommand: (text: string) => Promise<void>;
	private readonly handleBashCommand: (command: string, isExcluded: boolean) => Promise<void>;
	private readonly handleCompactCommand: (customInstructions?: string) => Promise<void>;
	private readonly handleReloadCommand: () => Promise<void>;
	private readonly shutdown: () => Promise<void>;
	private readonly isExtensionCommand: (text: string) => boolean;
	private readonly queueCompactionMessage: (text: string, mode: "steer" | "followUp") => void;
	private readonly updatePendingMessagesDisplay: () => void;
	private readonly flushPendingBashComponents: () => void;
	private readonly showWarning: (warningMessage: string) => void;
	private lastEscapeTime = 0;

	constructor(deps: KeyHandlerControllerDependencies) {
		this.ui = deps.ui;
		this.getDefaultEditor = deps.getDefaultEditor;
		this.getSession = deps.getSession;
		this.getEditor = deps.getEditor;
		this.getSettingsManager = deps.getSettingsManager;
		this.getIsBashMode = deps.getIsBashMode;
		this.setIsBashMode = deps.setIsBashMode;
		this.getOnInputCallback = deps.getOnInputCallback;
		this.getPendingUserInputs = deps.getPendingUserInputs;
		this._commandController = deps._commandController;
		this._accountAuthController = deps._accountAuthController;
		this._selectorController = deps._selectorController;
		this.restoreQueuedMessagesToEditor = deps.restoreQueuedMessagesToEditor;
		this.updateEditorBorderColor = deps.updateEditorBorderColor;
		this.handleCtrlC = deps.handleCtrlC;
		this.handleCtrlD = deps.handleCtrlD;
		this.handleCtrlZ = deps.handleCtrlZ;
		this.cycleThinkingLevel = deps.cycleThinkingLevel;
		this.toggleToolOutputExpansion = deps.toggleToolOutputExpansion;
		this.toggleThinkingBlockVisibility = deps.toggleThinkingBlockVisibility;
		this.openExternalEditor = deps.openExternalEditor;
		this.handleFollowUp = deps.handleFollowUp;
		this.handleDequeue = deps.handleDequeue;
		this.handleClearCommand = deps.handleClearCommand;
		this.showTreeSelector = deps.showTreeSelector;
		this.showUserMessageSelector = deps.showUserMessageSelector;
		this.showSessionSelector = deps.showSessionSelector;
		this.showSettingsSelector = deps.showSettingsSelector;
		this.showTrustSelector = deps.showTrustSelector;
		this.handleImportCommand = deps.handleImportCommand;
		this.handleBashCommand = deps.handleBashCommand;
		this.handleCompactCommand = deps.handleCompactCommand;
		this.handleReloadCommand = deps.handleReloadCommand;
		this.shutdown = deps.shutdown;
		this.isExtensionCommand = deps.isExtensionCommand;
		this.queueCompactionMessage = deps.queueCompactionMessage;
		this.updatePendingMessagesDisplay = deps.updatePendingMessagesDisplay;
		this.flushPendingBashComponents = deps.flushPendingBashComponents;
		this.showWarning = deps.showWarning;
	}

	private get defaultEditor(): CustomEditor {
		return this.getDefaultEditor();
	}
	private get session(): AgentSession {
		return this.getSession();
	}
	private get editor(): EditorComponent {
		return this.getEditor();
	}
	private get settingsManager(): SettingsManager {
		return this.getSettingsManager();
	}
	private get isBashMode(): boolean {
		return this.getIsBashMode();
	}
	private set isBashMode(isBashMode: boolean) {
		this.setIsBashMode(isBashMode);
	}
	private get onInputCallback(): ((text: string) => void) | undefined {
		return this.getOnInputCallback();
	}
	private get pendingUserInputs(): string[] {
		return this.getPendingUserInputs();
	}

	setupKeyHandlers(): void {
		// Set up handlers on defaultEditor - they use this.editor for text access
		// so they work correctly regardless of which editor is active
		this.defaultEditor.onEscape = () => {
			if (this.session.isStreaming) {
				this.restoreQueuedMessagesToEditor({ abort: true });
			} else if (this.session.isBashRunning) {
				this.session.abortBash();
			} else if (this.isBashMode) {
				this.editor.setText("");
				this.isBashMode = false;
				this.updateEditorBorderColor();
			} else if (!this.editor.getText().trim()) {
				// Double-escape with empty editor triggers /tree, /fork, or nothing based on setting
				const action = this.settingsManager.getDoubleEscapeAction();
				if (action !== "none") {
					const now = Date.now();
					if (now - this.lastEscapeTime < 500) {
						if (action === "tree") {
							this.showTreeSelector();
						} else {
							this.showUserMessageSelector();
						}
						this.lastEscapeTime = 0;
					} else {
						this.lastEscapeTime = now;
					}
				}
			}
		};

		// Register app action handlers
		this.defaultEditor.onAction("app.clear", () => this.handleCtrlC());
		this.defaultEditor.onCtrlD = () => this.handleCtrlD();
		this.defaultEditor.onAction("app.suspend", () => this.handleCtrlZ());
		this.defaultEditor.onAction("app.thinking.cycle", () => this.cycleThinkingLevel());

		// Global debug handler on TUI (works regardless of focus)
		this.ui.onDebug = () => this._commandController.handleDebugCommand();
		this.defaultEditor.onAction("app.tools.expand", () => this.toggleToolOutputExpansion());
		this.defaultEditor.onAction("app.thinking.toggle", () => this.toggleThinkingBlockVisibility());
		this.defaultEditor.onAction("app.editor.external", () => this.openExternalEditor());
		this.defaultEditor.onAction("app.message.followUp", () => this.handleFollowUp());
		this.defaultEditor.onAction("app.message.dequeue", () => this.handleDequeue());
		this.defaultEditor.onAction("app.session.new", () => this.handleClearCommand());
		this.defaultEditor.onAction("app.session.tree", () => this.showTreeSelector());
		this.defaultEditor.onAction("app.session.fork", () => this.showUserMessageSelector());
		this.defaultEditor.onAction("app.session.resume", () => this.showSessionSelector());

		this.defaultEditor.onChange = (text: string) => {
			const wasBashMode = this.isBashMode;
			this.isBashMode = text.trimStart().startsWith("!");
			if (wasBashMode !== this.isBashMode) {
				this.updateEditorBorderColor();
			}
		};
	}

	setupEditorSubmitHandler(): void {
		this.defaultEditor.onSubmit = async (text: string) => {
			text = text.trim();
			if (!text) return;

			// Handle commands
			if (text === "/settings") {
				this.showSettingsSelector();
				this.editor.setText("");
				return;
			}
			if (text === "/import" || text.startsWith("/import ")) {
				await this.handleImportCommand(text);
				this.editor.setText("");
				return;
			}
			if (text === "/copy") {
				await this._commandController.handleCopyCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/name" || text.startsWith("/name ")) {
				this._commandController.handleNameCommand(text);
				this.editor.setText("");
				return;
			}
			if (text === "/session") {
				this._commandController.handleSessionCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/changelog") {
				this._commandController.handleChangelogCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/hotkeys") {
				this._commandController.handleHotkeysCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/fork") {
				this.showUserMessageSelector();
				this.editor.setText("");
				return;
			}
			if (text === "/tree") {
				this.showTreeSelector();
				this.editor.setText("");
				return;
			}
			if (text === "/trust") {
				this.showTrustSelector();
				this.editor.setText("");
				return;
			}
			if (text === "/provider" || text.startsWith("/provider ")) {
				this.editor.setText("");
				this._accountAuthController.handleProviderCommand(text);
				return;
			}
			if (text === "/account" || text.startsWith("/account ")) {
				this.editor.setText("");
				await this._accountAuthController.handleAccountCommand(text);
				return;
			}
			if (text === "/new") {
				this.editor.setText("");
				await this.handleClearCommand();
				return;
			}
			if (text === "/compact" || text.startsWith("/compact ")) {
				const customInstructions = text.startsWith("/compact ") ? text.slice(9).trim() : undefined;
				this.editor.setText("");
				await this.handleCompactCommand(customInstructions);
				return;
			}
			if (text === "/reload") {
				this.editor.setText("");
				await this.handleReloadCommand();
				return;
			}
			if (text === "/debug") {
				this._commandController.handleDebugCommand();
				this.editor.setText("");
				return;
			}
			if (text === "/resume") {
				this.showSessionSelector();
				this.editor.setText("");
				return;
			}
			if (text === "/quit") {
				this.editor.setText("");
				await this.shutdown();
				return;
			}

			// Handle bash command (! for normal, !! for excluded from context)
			if (text.startsWith("!")) {
				const isExcluded = text.startsWith("!!");
				const command = isExcluded ? text.slice(2).trim() : text.slice(1).trim();
				if (command) {
					if (this.session.isBashRunning) {
						this.showWarning("A bash command is already running. Press Esc to cancel it first.");
						this.editor.setText(text);
						return;
					}
					this.editor.addToHistory?.(text);
					await this.handleBashCommand(command, isExcluded);
					this.isBashMode = false;
					this.updateEditorBorderColor();
					return;
				}
			}

			// Queue input during compaction (extension commands execute immediately)
			if (this.session.isCompacting) {
				if (this.isExtensionCommand(text)) {
					this.editor.addToHistory?.(text);
					this.editor.setText("");
					await this.session.prompt(text);
				} else {
					this.queueCompactionMessage(text, "steer");
				}
				return;
			}

			// If streaming, use prompt() with steer behavior
			// This handles extension commands (execute immediately), prompt template expansion, and queueing
			if (this.session.isStreaming) {
				this.editor.addToHistory?.(text);
				this.editor.setText("");
				await this.session.prompt(text, { streamingBehavior: "steer" });
				this.updatePendingMessagesDisplay();
				this.ui.requestRender();
				return;
			}

			// Normal message submission
			// First, move any pending bash components to chat
			this.flushPendingBashComponents();

			if (this.onInputCallback) {
				this.onInputCallback(text);
			} else {
				this.pendingUserInputs.push(text);
			}
			this.editor.addToHistory?.(text);
		};
	}
}
