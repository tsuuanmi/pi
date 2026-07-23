import { Text } from "#tui/components/display/text";
import { CancellableLoader } from "#tui/components/feedback/cancellable-loader";
import { DynamicBorder } from "#tui/components/layout/dynamic-border";
import { Loader } from "#tui/components/feedback/loader";
import { Spacer } from "#tui/components/layout/spacer";
import { LAYOUT_EDGE_X, LAYOUT_SECTION_GAP_Y } from "#tui/components/layout/spacing";
import { Container, type TUI } from "#tui/core/tui";
import type { Theme } from "#tui/theme/theme";
import { keyHint } from "#tui/input/keyboard/keybinding-hints";

/** Loader wrapped with borders for extension UI */
export class BorderedLoader extends Container {
	private loader: CancellableLoader | Loader;
	private cancellable: boolean;
	private signalController?: AbortController;

	constructor(tui: TUI, theme: Theme, message: string, options?: { cancellable?: boolean }) {
		super();
		this.cancellable = options?.cancellable ?? true;
		const borderColor = (s: string) => theme.fg("border", s);
		this.addChild(new DynamicBorder(borderColor));
		if (this.cancellable) {
			this.loader = new CancellableLoader(
				tui,
				(s) => theme.fg("accent", s),
				(s) => theme.fg("muted", s),
				message,
			);
		} else {
			this.signalController = new AbortController();
			this.loader = new Loader(
				tui,
				(s) => theme.fg("accent", s),
				(s) => theme.fg("muted", s),
				message,
			);
		}
		this.addChild(this.loader);
		if (this.cancellable) {
			this.addChild(new Spacer(LAYOUT_SECTION_GAP_Y));
			this.addChild(new Text(keyHint("tui.select.cancel", "cancel"), LAYOUT_EDGE_X, 0));
		}
		this.addChild(new Spacer(LAYOUT_SECTION_GAP_Y));
		this.addChild(new DynamicBorder(borderColor));
	}

	get signal(): AbortSignal {
		if (this.cancellable) {
			return (this.loader as CancellableLoader).signal;
		}
		return this.signalController?.signal ?? new AbortController().signal;
	}

	set onAbort(fn: (() => void) | undefined) {
		if (this.cancellable) {
			(this.loader as CancellableLoader).onAbort = fn;
		}
	}

	handleInput(data: string): void {
		if (this.cancellable) {
			(this.loader as CancellableLoader).handleInput(data);
		}
	}

	dispose(): void {
		if ("dispose" in this.loader && typeof this.loader.dispose === "function") {
			this.loader.dispose();
		} else if ("stop" in this.loader && typeof this.loader.stop === "function") {
			this.loader.stop();
		}
	}
}
