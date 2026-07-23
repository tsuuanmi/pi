import { performance } from "node:perf_hooks";
import { Text } from "#tui/components/display/text";
import { LAYOUT_EDGE_X, LAYOUT_SECTION_GAP_Y } from "#tui/components/layout/spacing";
import type { TUI } from "#tui/core/tui";

export interface LoaderIndicatorOptions {
	/** Animation frames. Use an empty array to hide the indicator. */
	frames?: string[];
	/** Frame interval in milliseconds for animated indicators. */
	intervalMs?: number;
}

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_INTERVAL_MS = 80;

/**
 * Loader component that updates with an optional spinning animation.
 */
export class Loader extends Text {
	private frames = [...DEFAULT_FRAMES];
	private intervalMs = DEFAULT_INTERVAL_MS;
	private currentFrame = 0;
	private intervalId: NodeJS.Timeout | null = null;
	private ui: TUI | null = null;
	private renderIndicatorVerbatim = false;
	private spinnerColorFn: (str: string) => string;
	private messageColorFn: (str: string) => string;
	private messageFormatter?: (message: string, elapsedMs: number) => string;
	private message: string = "Loading...";
	private startedAt = performance.now();

	constructor(
		ui: TUI,
		spinnerColorFn: (str: string) => string,
		messageColorFn: (str: string) => string,
		message: string = "Loading...",
		indicator?: LoaderIndicatorOptions,
		messageFormatter?: (message: string, elapsedMs: number) => string,
	) {
		super("", LAYOUT_EDGE_X, 0);
		this.ui = ui;
		this.spinnerColorFn = spinnerColorFn;
		this.messageColorFn = messageColorFn;
		this.message = message;
		this.messageFormatter = messageFormatter;
		this.setIndicator(indicator);
	}

	render(width: number): string[] {
		return [...Array.from({ length: LAYOUT_SECTION_GAP_Y }, () => ""), ...super.render(width)];
	}

	start(): void {
		this.startedAt = performance.now();
		this.updateDisplay();
		this.restartAnimation();
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	setMessage(message: string): void {
		this.message = message;
		this.startedAt = performance.now();
		this.updateDisplay();
	}

	setIndicator(indicator?: LoaderIndicatorOptions): void {
		this.renderIndicatorVerbatim = indicator !== undefined;
		this.frames = indicator?.frames !== undefined ? [...indicator.frames] : [...DEFAULT_FRAMES];
		this.intervalMs = indicator?.intervalMs && indicator.intervalMs > 0 ? indicator.intervalMs : DEFAULT_INTERVAL_MS;
		this.currentFrame = 0;
		this.start();
	}

	private restartAnimation(): void {
		this.stop();
		if (this.frames.length <= 1) {
			return;
		}
		this.intervalId = setInterval(() => {
			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
			this.updateDisplay();
		}, this.intervalMs);
	}

	private updateDisplay(): void {
		const frame = this.frames[this.currentFrame] ?? "";
		const renderedFrame = this.renderIndicatorVerbatim ? frame : this.spinnerColorFn(frame);
		const indicator = frame.length > 0 ? `${renderedFrame} ` : "";
		const elapsedMs = Math.max(0, performance.now() - this.startedAt);
		const message = this.messageFormatter
			? this.messageFormatter(this.message, elapsedMs)
			: this.messageColorFn(this.message);
		this.setText(`${indicator}${message}`);
		if (this.ui) {
			this.ui.requestRender();
		}
	}
}
