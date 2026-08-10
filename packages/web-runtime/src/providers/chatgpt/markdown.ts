/// <reference lib="dom" />

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const turndown = new TurndownService({
	headingStyle: "atx",
	bulletListMarker: "-",
	codeBlockStyle: "fenced",
	fence: "```",
	emDelimiter: "*",
	strongDelimiter: "**",
	linkStyle: "inlined",
});
turndown.use(gfm);
turndown.remove(["button", "script", "style"]);
turndown.addRule("removeImages", {
	filter: (node) => ["IMG", "PICTURE", "SOURCE"].includes(node.nodeName),
	replacement: () => "",
});
turndown.addRule("removeSvg", {
	filter: (node) => node.nodeName === "SVG",
	replacement: () => "",
});
turndown.addRule("compactListItem", {
	filter: "li",
	replacement: (content, node, options) => {
		const parent = node.parentNode as HTMLElement | null;
		let prefix = `${options.bulletListMarker} `;
		if (parent?.nodeName === "OL") {
			const start = Number(parent.getAttribute("start") ?? "1");
			const index = Array.prototype.indexOf.call(parent.children, node) as number;
			prefix = `${start + index}. `;
		}
		const normalized = content.replace(/^\n+|\n+$/g, "").replace(/\n/g, `\n${" ".repeat(prefix.length)}`);
		return `${prefix}${normalized}${node.nextSibling ? "\n" : ""}`;
	},
});

export function toMarkdown(html: string): string {
	return html.trim() ? turndown.turndown(html).trim() : "";
}

export interface MarkdownSegment {
	key: string;
	html: string;
	text: string;
	group?: string;
	streamable: boolean;
}

interface Candidate extends MarkdownSegment {
	changedAt: number;
	streamableAt?: number;
}

interface CommittedSegment {
	key: string;
	text: string;
}

export class MarkdownBuffer {
	private readonly candidates = new Map<number, Candidate>();
	private readonly committed: CommittedSegment[] = [];
	private latest: MarkdownSegment[] = [];
	private markdown = "";
	private lastGroup: string | undefined;
	private readonly transform: (markdown: string) => string;
	private readonly stabilityMs: number;

	constructor(transform: (markdown: string) => string = (markdown) => markdown, stabilityMs = 750) {
		if (!Number.isFinite(stabilityMs) || stabilityMs < 0) {
			throw new Error("Markdown stability window must be a non-negative finite number");
		}
		this.transform = transform;
		this.stabilityMs = stabilityMs;
	}

	observe(segments: MarkdownSegment[], now = Date.now()): string {
		this.assertCommitted(segments);
		this.latest = segments.map((segment) => ({ ...segment }));

		for (let index = this.committed.length; index < segments.length; index += 1) {
			const segment = segments[index]!;
			const previous = this.candidates.get(index);
			const unchanged =
				previous &&
				previous.key === segment.key &&
				previous.html === segment.html &&
				previous.text === segment.text &&
				previous.group === segment.group;
			this.candidates.set(index, {
				...segment,
				changedAt: unchanged ? previous.changedAt : now,
				...(segment.streamable
					? {
							streamableAt: unchanged && previous.streamableAt !== undefined ? previous.streamableAt : now,
						}
					: {}),
			});
		}
		for (const index of this.candidates.keys()) {
			if (index >= segments.length) this.candidates.delete(index);
		}

		let delta = "";
		while (this.committed.length < segments.length) {
			const index = this.committed.length;
			const candidate = this.candidates.get(index);
			if (!candidate?.streamable || candidate.streamableAt === undefined) break;
			if (now - Math.max(candidate.changedAt, candidate.streamableAt) < this.stabilityMs) break;
			delta += this.commit(candidate);
			this.committed.push({ key: candidate.key, text: candidate.text });
			this.candidates.delete(index);
		}
		return delta;
	}

	finish(): { markdown: string; delta: string } {
		this.assertCommitted(this.latest);
		let delta = "";
		for (let index = this.committed.length; index < this.latest.length; index += 1) {
			const segment = this.latest[index]!;
			delta += this.commit(segment);
			this.committed.push({ key: segment.key, text: segment.text });
		}
		this.candidates.clear();
		return { markdown: this.markdown, delta };
	}

	private assertCommitted(segments: MarkdownSegment[]): void {
		if (segments.length < this.committed.length) {
			throw new Error("ChatGPT removed a completed text block that Pi already streamed");
		}
		for (let index = 0; index < this.committed.length; index += 1) {
			const previous = this.committed[index]!;
			const current = segments[index]!;
			if (current.key !== previous.key || current.text !== previous.text) {
				throw new Error("ChatGPT changed a completed text block that Pi already streamed");
			}
		}
	}

	private commit(segment: MarkdownSegment): string {
		const block = this.transform(toMarkdown(segment.html));
		if (!block) return "";
		const separator = this.markdown
			? segment.group !== undefined && segment.group === this.lastGroup
				? "\n"
				: "\n\n"
			: "";
		const delta = `${separator}${block}`;
		this.markdown += delta;
		this.lastGroup = segment.group;
		return delta;
	}
}
