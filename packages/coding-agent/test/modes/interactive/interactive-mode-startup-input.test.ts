import { describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../../../src/core/agent-session/agent-session.ts";
import type { SettingsManager } from "../../../src/core/settings/settings-manager.ts";
import type { CustomEditor } from "../../../src/modes/interactive/components/custom-editor.ts";
import { KeyHandlerController } from "../../../src/modes/interactive/controllers/key-handler-controller.ts";
import { InteractiveMode } from "../../../src/modes/interactive/interactive-mode.ts";

type SubmitContext = {
	defaultEditor: { onSubmit?: (text: string) => void };
	editor: {
		addToHistory?: (text: string) => void;
		setText: (text: string) => void;
	};
	session: {
		isCompacting: boolean;
		isStreaming: boolean;
		isBashRunning: boolean;
		prompt: (text: string, options?: unknown) => Promise<void>;
	};
	flushPendingBashComponents: () => void;
	onInputCallback?: (text: string) => void;
	pendingUserInputs: string[];
};

type InputContext = {
	onInputCallback?: (text: string) => void;
	pendingUserInputs: string[];
};

type InteractiveModePrivate = {
	getUserInput(this: InputContext): Promise<string>;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrivate;

function createSubmitContext(): SubmitContext {
	return {
		defaultEditor: {},
		editor: {
			addToHistory: vi.fn(),
			setText: vi.fn(),
		},
		session: {
			isCompacting: false,
			isStreaming: false,
			isBashRunning: false,
			prompt: vi.fn(async () => {}),
		},
		flushPendingBashComponents: vi.fn(),
		pendingUserInputs: [],
	};
}

describe("InteractiveMode startup input", () => {
	it("queues a normal prompt submitted before the input callback is installed", async () => {
		const context = createSubmitContext();
		const controller = new KeyHandlerController({
			ui: {} as never,
			getDefaultEditor: () => context.defaultEditor as CustomEditor,
			getSession: () => context.session as AgentSession,
			getEditor: () => context.editor as never,
			getSettingsManager: () => ({}) as SettingsManager,
			getIsBashMode: () => false,
			setIsBashMode: () => {},
			getOnInputCallback: () => context.onInputCallback,
			getPendingUserInputs: () => context.pendingUserInputs,
			_commandController: {} as never,
			_accountAuthController: {} as never,
			_selectorController: {} as never,
			restoreQueuedMessagesToEditor: () => 0,
			updateEditorBorderColor: () => {},
			handleCtrlC: () => {},
			handleCtrlD: () => {},
			cycleThinkingLevel: () => {},
			toggleToolOutputExpansion: () => {},
			toggleThinkingBlockVisibility: () => {},
			openExternalEditor: async () => {},
			handleFollowUp: () => {},
			handleDequeue: () => {},
			handleClearCommand: async () => {},
			showTreeSelector: () => {},
			showUserMessageSelector: () => {},
			showSessionSelector: () => {},
			showSettingsSelector: () => {},
			showTrustSelector: () => {},
			handleImportCommand: async () => {},
			handleBashCommand: async () => {},
			handleCompactCommand: async () => {},
			handleReloadCommand: async () => {},
			shutdown: async () => {},
			isExtensionCommand: () => false,
			queueCompactionMessage: () => {},
			updatePendingMessagesDisplay: () => {},
			flushPendingBashComponents: context.flushPendingBashComponents,
			showWarning: () => {},
		});
		controller.setupEditorSubmitHandler();

		await context.defaultEditor.onSubmit?.(" early prompt ");

		expect(context.pendingUserInputs).toEqual(["early prompt"]);
		expect(context.flushPendingBashComponents).toHaveBeenCalledTimes(1);
		expect(context.editor.addToHistory).toHaveBeenCalledWith("early prompt");
	});

	it("returns queued startup input before installing a new input callback", async () => {
		const context: InputContext = {
			pendingUserInputs: ["queued prompt"],
		};

		await expect(interactiveModePrototype.getUserInput.call(context)).resolves.toBe("queued prompt");
		expect(context.onInputCallback).toBeUndefined();
		expect(context.pendingUserInputs).toEqual([]);
	});
});
