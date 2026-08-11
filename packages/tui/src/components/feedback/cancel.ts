import { Loader } from "#tui/components/feedback/loader";
import type { KeybindingsManager } from "#tui/input/keyboard/keybindings";
import type { TUI } from "#tui/tui";

/**
 * Loader that can be cancelled with Escape.
 * Extends Loader with an AbortSignal for cancelling async operations.
 *
 * @example
 * const loader = new CancellableLoader(tui, cyan, dim, "Indexing");
 * loader.onAbort = () => done(null);
 * doWork(loader.signal).then(done);
 */
export class CancellableLoader extends Loader {
	private abortController = new AbortController();
	private readonly keybindings: KeybindingsManager;

	constructor(
		tui: TUI,
		spinnerColor: (text: string) => string,
		messageColor: (text: string) => string,
		message: string,
		keybindings: KeybindingsManager,
	) {
		super(tui, spinnerColor, messageColor, message);
		this.keybindings = keybindings;
	}

	/** Called when user presses Escape */
	onAbort?: () => void;

	/** AbortSignal that is aborted when user presses Escape */
	get signal(): AbortSignal {
		return this.abortController.signal;
	}

	/** Whether the loader was aborted */
	get aborted(): boolean {
		return this.abortController.signal.aborted;
	}

	handleInput(data: string): void {
		if (this.aborted) return;
		const kb = this.keybindings;
		if (kb.matches(data, "tui.select.cancel")) {
			this.abortController.abort();
			this.onAbort?.();
		}
	}

	dispose(): void {
		if (!this.aborted) this.abortController.abort();
		this.stop();
	}
}
