export const RESPONSE_GRACE_MS = 60_000;
export const EMPTY_GRACE_MS = 10_000;
export const ACTION_GRACE_MS = 60_000;
export const SETTLE_MS = 2_000;

export interface CompletionState {
	responsePresent: boolean;
	running: boolean;
	currentText: string;
	currentHtml?: string;
	completionActionVisible: boolean;
}

export function isComplete(state: CompletionState): boolean {
	return state.responsePresent && !state.running && state.currentText.length > 0 && state.completionActionVisible;
}

export class CompletionTracker {
	private candidate?: { signature: string; since: number };
	private readonly stableMs: number;

	constructor(stableMs = SETTLE_MS) {
		this.stableMs = stableMs;
	}

	update(state: CompletionState, now = Date.now()): boolean {
		if (!isComplete(state)) {
			this.candidate = undefined;
			return false;
		}
		const signature = `${state.currentText}\0${state.currentHtml ?? state.currentText}`;
		if (this.candidate?.signature !== signature) {
			this.candidate = { signature, since: now };
			return false;
		}
		return now - this.candidate.since >= this.stableMs;
	}
}

export class DomHealthTracker {
	private sawResponse = false;
	private missingSince?: number;
	private emptySince?: number;
	private missingAction?: { text: string; since: number };
	private readonly missingMs: number;
	private readonly emptyMs: number;
	private readonly actionMs: number;

	constructor(missingMs = RESPONSE_GRACE_MS, emptyMs = EMPTY_GRACE_MS, actionMs = ACTION_GRACE_MS) {
		this.missingMs = missingMs;
		this.emptyMs = emptyMs;
		this.actionMs = actionMs;
	}

	update(state: Omit<CompletionState, "currentHtml">, now = Date.now()): string | undefined {
		if (state.responsePresent) {
			this.sawResponse = true;
			this.missingSince = undefined;
		} else {
			this.missingSince ??= now;
			if (now - this.missingSince >= this.missingMs) {
				return this.sawResponse
					? "ChatGPT response DOM disappeared while the turn was active"
					: "ChatGPT did not create a response DOM after the message was sent";
			}
		}

		const empty =
			state.responsePresent && !state.running && state.currentText.length === 0 && state.completionActionVisible;
		if (!empty) {
			this.emptySince = undefined;
		} else {
			this.emptySince ??= now;
			if (now - this.emptySince >= this.emptyMs) return "ChatGPT completed without a final answer";
		}

		const missingAction =
			state.responsePresent && !state.running && state.currentText.length > 0 && !state.completionActionVisible;
		if (!missingAction) {
			this.missingAction = undefined;
		} else if (this.missingAction?.text !== state.currentText) {
			this.missingAction = { text: state.currentText, since: now };
		} else if (now - this.missingAction.since >= this.actionMs) {
			return "ChatGPT stopped generating without completed-turn evidence; the response DOM may have changed";
		}
		return undefined;
	}
}
