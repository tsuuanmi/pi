export interface TraceBlock {
	kind: "answer" | "commentary" | "status";
	text: string;
	key?: string;
	complete?: boolean;
	uiControl?: boolean;
}

export interface TraceEvent {
	kind: "reasoning" | "commentary";
	text: string;
	continuation?: boolean;
}

export class TraceTracker {
	private readonly emitted = new Map<string, string>();
	private readonly candidates = new Map<string, { text: string; changedAt: number }>();
	private readonly stabilityMs: number;

	constructor(stabilityMs = 250) {
		this.stabilityMs = stabilityMs;
	}

	observe(blocks: TraceBlock[], completionActionVisible: boolean, now = Date.now()): TraceEvent[] {
		const events: TraceEvent[] = [];
		let statusSlot = 0;
		let commentarySlot = 0;
		for (const block of blocks) {
			if (block.kind === "answer") continue;
			const index = block.kind === "status" ? statusSlot++ : commentarySlot++;
			const slot = block.key ? `${block.kind}:${block.key}` : `${block.kind}:${index}`;
			const normalized = block.text
				.replace(/\r\n/g, "\n")
				.split("\n")
				.map((line) => line.replace(/[\t ]+/g, " ").trim())
				.join("\n")
				.replace(/\n{3,}/g, "\n\n")
				.trim();
			const text = block.kind === "status" ? normalized.replace(/\s+/g, " ") : normalized;
			if (!text) continue;

			let candidate = this.candidates.get(slot);
			if (!candidate || candidate.text !== text) {
				candidate = { text, changedAt: now };
				this.candidates.set(slot, candidate);
				if (!completionActionVisible && this.stabilityMs > 0) continue;
			}
			if (block.kind === "commentary" && block.complete === false && !completionActionVisible) continue;
			if (!completionActionVisible && now - candidate.changedAt < this.stabilityMs) continue;

			const previous = this.emitted.get(slot);
			if (previous === text) continue;
			this.emitted.set(slot, text);
			const kind = block.kind === "commentary" ? "commentary" : "reasoning";
			if (previous && text.startsWith(previous)) {
				events.push({ kind, text: text.slice(previous.length), continuation: true });
			} else {
				events.push({ kind, text });
			}
		}
		return events;
	}
}

export function isTraceControl(block: TraceBlock): boolean {
	if (block.kind !== "status") return false;
	const text = block.text.replace(/\s+/g, " ").trim();
	return block.uiControl === true || text === "Answer now" || text === "Thinking";
}
