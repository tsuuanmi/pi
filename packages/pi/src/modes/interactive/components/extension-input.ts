/**
 * Simple text input component for extensions.
 */

import {
	Container,
	CountdownTimer,
	DynamicBorder,
	type Focusable,
	getKeybindings,
	Input,
	keyHint,
	LAYOUT_EDGE_X,
	LAYOUT_SECTION_GAP_Y,
	Spacer,
	Text,
	type TUI,
	theme,
} from "@tsuuanmi/pi-tui";

export interface ExtensionInputOptions {
	tui?: TUI;
	timeout?: number;
}

export class ExtensionInputComponent extends Container implements Focusable {
	private input: Input;
	private onSubmitCallback: (value: string) => void;
	private onCancelCallback: () => void;
	private titleText: Text;
	private baseTitle: string;
	private countdown: CountdownTimer | undefined;

	// Focusable implementation - propagate to input for IME cursor positioning
	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	constructor(
		title: string,
		_placeholder: string | undefined,
		onSubmit: (value: string) => void,
		onCancel: () => void,
		opts?: ExtensionInputOptions,
	) {
		super();

		this.onSubmitCallback = onSubmit;
		this.onCancelCallback = onCancel;
		this.baseTitle = title;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(LAYOUT_SECTION_GAP_Y));

		this.titleText = new Text(theme.fg("accent", title), LAYOUT_EDGE_X, 0);
		this.addChild(this.titleText);
		this.addChild(new Spacer(LAYOUT_SECTION_GAP_Y));

		if (opts?.timeout && opts.timeout > 0 && opts.tui) {
			this.countdown = new CountdownTimer(
				opts.timeout,
				opts.tui,
				(s) => this.titleText.setText(theme.fg("accent", `${this.baseTitle} (${s}s)`)),
				() => this.onCancelCallback(),
			);
		}

		this.input = new Input();
		this.addChild(this.input);
		this.addChild(new Spacer(LAYOUT_SECTION_GAP_Y));
		this.addChild(
			new Text(
				`${keyHint("tui.select.confirm", "submit")}  ${keyHint("tui.select.cancel", "cancel")}`,
				LAYOUT_EDGE_X,
				0,
			),
		);
		this.addChild(new Spacer(LAYOUT_SECTION_GAP_Y));
		this.addChild(new DynamicBorder());
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
			this.onSubmitCallback(this.input.getValue());
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
		} else {
			this.input.handleInput(keyData);
		}
	}

	dispose(): void {
		this.countdown?.dispose();
	}
}
