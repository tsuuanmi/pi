import type { ProgressCallback, ProgressEvent } from "./types.ts";

export class ProgressReporter {
	private callback: ProgressCallback | undefined;

	setCallback(callback: ProgressCallback | undefined): void {
		this.callback = callback;
	}

	async run(
		action: ProgressEvent["action"],
		source: string,
		message: string,
		operation: () => Promise<void>,
	): Promise<void> {
		this.callback?.({ type: "start", action, source, message });
		try {
			await operation();
			this.callback?.({ type: "complete", action, source });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.callback?.({ type: "error", action, source, message });
			throw error;
		}
	}
}
