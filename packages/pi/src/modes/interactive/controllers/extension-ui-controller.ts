/**
 * ExtensionUIController — extension UI subsystem extracted verbatim from
 * `InteractiveMode` (`modes/interactive/interactive-mode.ts`). Owns the
 * extension selector/input/editor overlays, widgets, custom header/footer,
 * terminal-input listeners, and the extension UI dialog surface. The host
 * `InteractiveMode` delegates to this controller and injects getters for the
 * three pieces of mutable host state it still owns (`editor`, `builtInHeader`,
 * `toolOutputExpanded`). Pure structural / zero behavior change.
 */

import type { Component, EditorComponent, OverlayHandle, OverlayOptions, StatusLineComponent } from "@tsuuanmi/pi-tui";
import { Container, Spacer, Text, type Theme, type TUI, theme } from "@tsuuanmi/pi-tui";
import type { ExtensionUIDialogOptions, ExtensionWidgetOptions } from "#pi/extensions/index";
import { ExtensionEditorComponent } from "#pi/modes/interactive/components/extension-editor";
import { ExtensionInputComponent } from "#pi/modes/interactive/components/extension-input";
import { ExtensionSelectorComponent } from "#pi/modes/interactive/components/selectors/extension-selector";
import type { FooterDataProvider, ReadonlyFooterDataProvider } from "#pi/modes/interactive/footer-data-provider";
import type { KeybindingsManager } from "#pi/settings/keybindings";

/** Interface for components that can be expanded/collapsed */
interface Expandable {
	setExpanded(expanded: boolean): void;
}

function isExpandable(obj: unknown): obj is Expandable {
	return typeof obj === "object" && obj !== null && "setExpanded" in obj && typeof obj.setExpanded === "function";
}

export class ExtensionUIController {
	// Extension UI state
	private extensionSelector: ExtensionSelectorComponent | undefined = undefined;
	private extensionInput: ExtensionInputComponent | undefined = undefined;
	private extensionEditor: ExtensionEditorComponent | undefined = undefined;
	private extensionTerminalInputUnsubscribers = new Set<() => void>();

	// Extension widgets (components rendered above/below the editor)
	private extensionWidgetsAbove = new Map<string, Component & { dispose?(): void }>();
	private extensionWidgetsBelow = new Map<string, Component & { dispose?(): void }>();
	private _widgetContainerAbove: Container;
	private _widgetContainerBelow: Container;

	// Custom footer from extension (undefined = use built-in footer)
	private customFooter: (Component & { dispose?(): void }) | undefined = undefined;

	// Custom header from extension (undefined = use built-in header)
	private _customHeader: (Component & { dispose?(): void }) | undefined = undefined;

	private readonly ui: TUI;
	private readonly editorContainer: Container;
	private readonly headerContainer: Container;
	private readonly keybindings: KeybindingsManager;
	private readonly footer: StatusLineComponent;
	private readonly footerDataProvider: FooterDataProvider;

	// Getters for mutable host-owned state (read live so reset/restore reflects the current editor/header).
	private readonly getEditor: () => EditorComponent;
	private readonly getBuiltInHeader: () => Component | undefined;
	private readonly getToolOutputExpanded: () => boolean;

	// Delegates back into the host for the handful of host-owned operations.
	private readonly showError: (message: string) => void;
	private readonly showWarning: (message: string) => void;
	private readonly showStatus: (message: string) => void;
	private readonly toggleToolOutputExpansion: () => void;

	constructor(opts: {
		ui: TUI;
		editorContainer: Container;
		headerContainer: Container;
		keybindings: KeybindingsManager;
		footer: StatusLineComponent;
		footerDataProvider: FooterDataProvider;
		getEditor: () => EditorComponent;
		getBuiltInHeader: () => Component | undefined;
		getToolOutputExpanded: () => boolean;
		showError: (message: string) => void;
		showWarning: (message: string) => void;
		showStatus: (message: string) => void;
		toggleToolOutputExpansion: () => void;
	}) {
		this.ui = opts.ui;
		this.editorContainer = opts.editorContainer;
		this.headerContainer = opts.headerContainer;
		this.keybindings = opts.keybindings;
		this.footer = opts.footer;
		this.footerDataProvider = opts.footerDataProvider;
		this.getEditor = opts.getEditor;
		this.getBuiltInHeader = opts.getBuiltInHeader;
		this.getToolOutputExpanded = opts.getToolOutputExpanded;
		this.showError = opts.showError;
		this.showWarning = opts.showWarning;
		this.showStatus = opts.showStatus;
		this.toggleToolOutputExpansion = opts.toggleToolOutputExpansion;
		this._widgetContainerAbove = new Container();
		this._widgetContainerBelow = new Container();
	}

	get widgetContainerAbove(): Container {
		return this._widgetContainerAbove;
	}

	get widgetContainerBelow(): Container {
		return this._widgetContainerBelow;
	}

	get customHeader(): (Component & { dispose?(): void }) | undefined {
		return this._customHeader;
	}

	/**
	 * Set extension status text in the footer.
	 */
	setExtensionStatus(key: string, text: string | undefined): void {
		this.footerDataProvider.setExtensionStatus(key, text);
		this.ui.requestRender();
	}

	/**
	 * Set an extension widget (string array or custom component).
	 */
	setExtensionWidget(
		key: string,
		content: string[] | ((tui: TUI, thm: Theme) => Component & { dispose?(): void }) | undefined,
		options?: ExtensionWidgetOptions,
	): void {
		const placement = options?.placement ?? "aboveEditor";
		const removeExisting = (map: Map<string, Component & { dispose?(): void }>) => {
			const existing = map.get(key);
			if (existing?.dispose) existing.dispose();
			map.delete(key);
		};

		removeExisting(this.extensionWidgetsAbove);
		removeExisting(this.extensionWidgetsBelow);

		if (content === undefined) {
			this.renderWidgets();
			return;
		}

		let component: Component & { dispose?(): void };

		if (Array.isArray(content)) {
			// Wrap string array in a Container with Text components
			const container = new Container();
			for (const line of content.slice(0, ExtensionUIController.MAX_WIDGET_LINES)) {
				container.addChild(new Text(line, 1, 0));
			}
			if (content.length > ExtensionUIController.MAX_WIDGET_LINES) {
				container.addChild(new Text(theme.fg("muted", "... (widget truncated)"), 1, 0));
			}
			component = container;
		} else {
			// Factory function - create component
			component = content(this.ui, theme);
		}

		const targetMap = placement === "belowEditor" ? this.extensionWidgetsBelow : this.extensionWidgetsAbove;
		targetMap.set(key, component);
		this.renderWidgets();
	}

	clearExtensionWidgets(): void {
		for (const widget of this.extensionWidgetsAbove.values()) {
			widget.dispose?.();
		}
		for (const widget of this.extensionWidgetsBelow.values()) {
			widget.dispose?.();
		}
		this.extensionWidgetsAbove.clear();
		this.extensionWidgetsBelow.clear();
		this.renderWidgets();
	}

	resetWidgets(): void {
		if (this.extensionSelector) {
			this.hideExtensionSelector();
		}
		if (this.extensionInput) {
			this.hideExtensionInput();
		}
		if (this.extensionEditor) {
			this.hideExtensionEditor();
		}
		this.ui.hideOverlay();
		this.clearExtensionTerminalInputListeners();
		this.setExtensionFooter(undefined);
		this.setExtensionHeader(undefined);
		this.clearExtensionWidgets();
		this.footerDataProvider.clearExtensionStatuses();
	}

	// Maximum total widget lines to prevent viewport overflow
	private static readonly MAX_WIDGET_LINES = 10;

	/**
	 * Render all extension widgets to the widget container.
	 */
	renderWidgets(): void {
		if (!this.widgetContainerAbove || !this.widgetContainerBelow) return;
		this.renderWidgetContainer(this.widgetContainerAbove, this.extensionWidgetsAbove, true, true);
		this.renderWidgetContainer(this.widgetContainerBelow, this.extensionWidgetsBelow, false, false);
		this.ui.requestRender();
	}

	renderWidgetContainer(
		container: Container,
		widgets: Map<string, Component & { dispose?(): void }>,
		spacerWhenEmpty: boolean,
		leadingSpacer: boolean,
	): void {
		container.clear();

		if (widgets.size === 0) {
			if (spacerWhenEmpty) {
				container.addChild(new Spacer(1));
			}
			return;
		}

		if (leadingSpacer) {
			container.addChild(new Spacer(1));
		}
		for (const component of widgets.values()) {
			container.addChild(component);
		}
	}

	/**
	 * Set a custom footer component, or restore the built-in footer.
	 */
	setExtensionFooter(
		factory:
			| ((tui: TUI, thm: Theme, footerData: ReadonlyFooterDataProvider) => Component & { dispose?(): void })
			| undefined,
	): void {
		// Dispose existing custom footer
		if (this.customFooter?.dispose) {
			this.customFooter.dispose();
		}

		// Remove current footer from UI
		if (this.customFooter) {
			this.ui.removeChild(this.customFooter);
		} else {
			this.ui.removeChild(this.footer);
		}

		if (factory) {
			// Create and add custom footer, passing the data provider
			this.customFooter = factory(this.ui, theme, this.footerDataProvider);
			this.ui.addChild(this.customFooter);
		} else {
			// Restore built-in footer
			this.customFooter = undefined;
			this.ui.addChild(this.footer);
		}

		this.ui.requestRender();
	}

	/**
	 * Set a custom header component, or restore the built-in header.
	 */
	setExtensionHeader(factory: ((tui: TUI, thm: Theme) => Component & { dispose?(): void }) | undefined): void {
		// Header may not be initialized yet if called during early initialization
		const builtInHeader = this.getBuiltInHeader();
		if (!builtInHeader) {
			return;
		}

		// Dispose existing custom header
		if (this._customHeader?.dispose) {
			this._customHeader.dispose();
		}

		// Find the index of the current header in the header container
		const currentHeader = this._customHeader || builtInHeader;
		const index = this.headerContainer.children.indexOf(currentHeader);

		if (factory) {
			// Create and add custom header
			this._customHeader = factory(this.ui, theme);
			if (isExpandable(this._customHeader)) {
				this._customHeader.setExpanded(this.getToolOutputExpanded());
			}
			if (index !== -1) {
				this.headerContainer.children[index] = this._customHeader;
			} else {
				// If not found (e.g. builtInHeader was never added), add at the top
				this.headerContainer.children.unshift(this._customHeader);
			}
		} else {
			// Restore built-in header
			this._customHeader = undefined;
			if (isExpandable(builtInHeader)) {
				builtInHeader.setExpanded(this.getToolOutputExpanded());
			}
			if (index !== -1) {
				this.headerContainer.children[index] = builtInHeader;
			}
		}

		this.ui.requestRender();
	}

	addExtensionTerminalInputListener(
		handler: (data: string) => { consume?: boolean; data?: string } | undefined,
	): () => void {
		const unsubscribe = this.ui.addInputListener(handler);
		this.extensionTerminalInputUnsubscribers.add(unsubscribe);
		return () => {
			unsubscribe();
			this.extensionTerminalInputUnsubscribers.delete(unsubscribe);
		};
	}

	clearExtensionTerminalInputListeners(): void {
		for (const unsubscribe of this.extensionTerminalInputUnsubscribers) {
			unsubscribe();
		}
		this.extensionTerminalInputUnsubscribers.clear();
	}

	/**
	 * Show a selector for extensions.
	 */
	showExtensionSelector(
		title: string,
		options: string[],
		opts?: ExtensionUIDialogOptions,
	): Promise<string | undefined> {
		return new Promise((resolve) => {
			if (opts?.signal?.aborted) {
				resolve(undefined);
				return;
			}

			const onAbort = () => {
				this.hideExtensionSelector();
				resolve(undefined);
			};
			opts?.signal?.addEventListener("abort", onAbort, { once: true });

			this.extensionSelector = new ExtensionSelectorComponent(
				title,
				options,
				(option) => {
					opts?.signal?.removeEventListener("abort", onAbort);
					this.hideExtensionSelector();
					resolve(option);
				},
				() => {
					opts?.signal?.removeEventListener("abort", onAbort);
					this.hideExtensionSelector();
					resolve(undefined);
				},
				{ tui: this.ui, timeout: opts?.timeout, onToggleToolsExpanded: () => this.toggleToolOutputExpansion() },
			);

			this.editorContainer.clear();
			this.editorContainer.addChild(this.extensionSelector);
			this.ui.setFocus(this.extensionSelector);
			this.ui.requestRender();
		});
	}

	/**
	 * Hide the extension selector.
	 */
	hideExtensionSelector(): void {
		this.extensionSelector?.dispose();
		this.editorContainer.clear();
		this.editorContainer.addChild(this.getEditor());
		this.extensionSelector = undefined;
		this.ui.setFocus(this.getEditor());
		this.ui.requestRender();
	}

	/**
	 * Show a confirmation dialog for extensions.
	 */
	async showExtensionConfirm(title: string, message: string, opts?: ExtensionUIDialogOptions): Promise<boolean> {
		const result = await this.showExtensionSelector(`${title}\n${message}`, ["Yes", "No"], opts);
		return result === "Yes";
	}

	/**
	 * Show a text input for extensions.
	 */
	showExtensionInput(
		title: string,
		placeholder?: string,
		opts?: ExtensionUIDialogOptions,
	): Promise<string | undefined> {
		return new Promise((resolve) => {
			if (opts?.signal?.aborted) {
				resolve(undefined);
				return;
			}

			const onAbort = () => {
				this.hideExtensionInput();
				resolve(undefined);
			};
			opts?.signal?.addEventListener("abort", onAbort, { once: true });

			this.extensionInput = new ExtensionInputComponent(
				title,
				placeholder,
				(value) => {
					opts?.signal?.removeEventListener("abort", onAbort);
					this.hideExtensionInput();
					resolve(value);
				},
				() => {
					opts?.signal?.removeEventListener("abort", onAbort);
					this.hideExtensionInput();
					resolve(undefined);
				},
				{ tui: this.ui, timeout: opts?.timeout },
			);

			this.editorContainer.clear();
			this.editorContainer.addChild(this.extensionInput);
			this.ui.setFocus(this.extensionInput);
			this.ui.requestRender();
		});
	}

	/**
	 * Hide the extension input.
	 */
	hideExtensionInput(): void {
		this.extensionInput?.dispose();
		this.editorContainer.clear();
		this.editorContainer.addChild(this.getEditor());
		this.extensionInput = undefined;
		this.ui.setFocus(this.getEditor());
		this.ui.requestRender();
	}

	/**
	 * Show a multi-line editor for extensions (with Ctrl+G support).
	 */
	showExtensionEditor(title: string, prefill?: string): Promise<string | undefined> {
		return new Promise((resolve) => {
			this.extensionEditor = new ExtensionEditorComponent(
				this.ui,
				this.keybindings,
				title,
				prefill,
				(value) => {
					this.hideExtensionEditor();
					resolve(value);
				},
				() => {
					this.hideExtensionEditor();
					resolve(undefined);
				},
			);

			this.editorContainer.clear();
			this.editorContainer.addChild(this.extensionEditor);
			this.ui.setFocus(this.extensionEditor);
			this.ui.requestRender();
		});
	}

	/**
	 * Hide the extension editor.
	 */
	hideExtensionEditor(): void {
		this.editorContainer.clear();
		this.editorContainer.addChild(this.getEditor());
		this.extensionEditor = undefined;
		this.ui.setFocus(this.getEditor());
		this.ui.requestRender();
	}

	/**
	 * Show a notification for extensions.
	 */
	showExtensionNotify(message: string, type?: "info" | "warning" | "error"): void {
		if (type === "error") {
			this.showError(message);
		} else if (type === "warning") {
			this.showWarning(message);
		} else {
			this.showStatus(message);
		}
	}

	/** Show a custom component with keyboard focus. Overlay mode renders on top of existing content. */
	async showExtensionCustom<T>(
		factory: (
			tui: TUI,
			theme: Theme,
			keybindings: KeybindingsManager,
			done: (result: T) => void,
		) => (Component & { dispose?(): void }) | Promise<Component & { dispose?(): void }>,
		options?: {
			overlay?: boolean;
			overlayOptions?: OverlayOptions | (() => OverlayOptions);
			onHandle?: (handle: OverlayHandle) => void;
		},
	): Promise<T> {
		const savedText = this.getEditor().getText();
		const isOverlay = options?.overlay ?? false;

		const restoreEditor = () => {
			this.editorContainer.clear();
			this.editorContainer.addChild(this.getEditor());
			this.getEditor().setText(savedText);
			this.ui.setFocus(this.getEditor());
			this.ui.requestRender();
		};

		return new Promise((resolve, reject) => {
			let component: Component & { dispose?(): void };
			let closed = false;

			const close = (result: T) => {
				if (closed) return;
				closed = true;
				if (isOverlay) this.ui.hideOverlay();
				else restoreEditor();
				// Note: both branches above already call requestRender
				resolve(result);
				try {
					component?.dispose?.();
				} catch {
					/* ignore dispose errors */
				}
			};

			Promise.resolve(factory(this.ui, theme, this.keybindings, close))
				.then((c) => {
					if (closed) return;
					component = c;
					if (isOverlay) {
						// Resolve overlay options - can be static or dynamic function
						const resolveOptions = (): OverlayOptions | undefined => {
							if (options?.overlayOptions) {
								const opts =
									typeof options.overlayOptions === "function"
										? options.overlayOptions()
										: options.overlayOptions;
								return opts;
							}
							// Fallback: use component's width property if available
							const w = (component as { width?: number }).width;
							return w ? { width: w } : undefined;
						};
						const handle = this.ui.showOverlay(component, resolveOptions());
						// Expose handle to caller for visibility control
						options?.onHandle?.(handle);
					} else {
						this.editorContainer.clear();
						this.editorContainer.addChild(component);
						this.ui.setFocus(component);
						this.ui.requestRender();
					}
				})
				.catch((err) => {
					if (closed) return;
					if (!isOverlay) restoreEditor();
					reject(err);
				});
		});
	}
}
