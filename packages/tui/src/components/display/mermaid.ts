import { renderMermaidASCII } from "beautiful-mermaid";
import { visibleWidth } from "#tui/utilities/text";

const PARTICIPANT = /^(\s*(?:participant|actor)\s+\S+\s+as\s+)(.+?)\s*$/i;
const MESSAGE = /^(\s*\S+\s*(?:-->>|->>|-->|->|--\)|-\)|--x|-x)\s*[+-]?\S+\s*:\s*)(.+?)\s*$/;
const NOTE = /^(\s*Note\s+(?:left of|right of|over)\s+[^:]+:\s*)(.+?)\s*$/i;

type MermaidType =
	| "sequenceDiagram"
	| "classDiagram"
	| "erDiagram"
	| "stateDiagram"
	| "graph"
	| "flowchart"
	| "xychart";

export class MermaidRenderError extends Error {
	constructor(message: string, cause?: unknown) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "MermaidRenderError";
	}
}

/**
 * Render a supported Mermaid diagram as terminal text that fits the available width.
 * Unsupported declarations, invalid source, and diagrams that cannot fit are errors.
 */
export function renderMermaid(source: string, width: number): string[] {
	if (!Number.isInteger(width) || width < 1) {
		throw new MermaidRenderError(`Mermaid diagrams require a positive integer width; received ${width}.`);
	}

	const type = getType(source);
	let lines = render(source, type);

	if (type === "sequenceDiagram" && widest(lines) > width) {
		lines = render(compactSequence(source, width), type);
	}

	const renderedWidth = widest(lines);
	if (renderedWidth > width) {
		throw new MermaidRenderError(
			`Mermaid ${type} diagram is ${renderedWidth} columns wide, but only ${width} columns are available.`,
		);
	}

	return lines;
}

function render(source: string, type: MermaidType): string[] {
	try {
		const output = renderMermaidASCII(source, { colorMode: "none" });
		const lines = output.split("\n").map((line) => line.trimEnd());

		while (lines.length > 1 && lines[lines.length - 1] === "") {
			lines.pop();
		}

		if (lines.length === 0 || lines.every((line) => line === "")) {
			throw new Error("the renderer produced an empty diagram");
		}

		return lines;
	} catch (error) {
		if (error instanceof MermaidRenderError) {
			throw error;
		}

		const reason = error instanceof Error ? error.message : String(error);
		throw new MermaidRenderError(`Unable to render Mermaid ${type} diagram: ${reason}`, error);
	}
}

function getType(source: string): MermaidType {
	const declaration = source
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0 && !line.startsWith("%%"));

	if (!declaration) {
		throw new MermaidRenderError("Mermaid source does not contain a diagram declaration.");
	}

	if (/^sequenceDiagram(?:\s|;|$)/i.test(declaration)) return "sequenceDiagram";
	if (/^classDiagram(?:\s|;|$)/i.test(declaration)) return "classDiagram";
	if (/^erDiagram(?:\s|;|$)/i.test(declaration)) return "erDiagram";
	if (/^stateDiagram(?:-v2)?(?:\s|;|$)/i.test(declaration)) return "stateDiagram";
	if (/^(?:graph|flowchart)\s+(?:TB|TD|BT|RL|LR)(?:\s|;|$)/i.test(declaration)) {
		return declaration.toLowerCase().startsWith("graph") ? "graph" : "flowchart";
	}
	if (/^xychart(?:-beta)?(?:\s|;|$)/i.test(declaration)) return "xychart";

	throw new MermaidRenderError(`Unsupported Mermaid diagram declaration: ${declaration}`);
}

function widest(lines: string[]): number {
	return Math.max(...lines.map((line) => visibleWidth(line)));
}

function compactSequence(source: string, width: number): string {
	const actorCount = countActors(source);
	const actorWidth = Math.max(6, Math.floor((width - 10 * Math.max(0, actorCount - 1) - 10) / actorCount));
	const messageWidth = Math.max(8, actorWidth + 6);

	return source
		.split(/\r?\n/)
		.map((line) => {
			const participant = PARTICIPANT.exec(line);
			if (participant) return `${participant[1]}${wrapLabel(participant[2]!, actorWidth)}`;

			const message = MESSAGE.exec(line);
			if (message) return `${message[1]}${wrapLabel(message[2]!, messageWidth)}`;

			const note = NOTE.exec(line);
			if (note) return `${note[1]}${wrapLabel(note[2]!, messageWidth)}`;

			return line;
		})
		.join("\n");
}

function countActors(source: string): number {
	const actors = new Set<string>();

	for (const line of source.split(/\r?\n/)) {
		const participant = /^\s*(?:participant|actor)\s+(\S+)/i.exec(line);
		if (participant) {
			actors.add(participant[1]!);
			continue;
		}

		const message = /^\s*(\S+)\s*(?:-->>|->>|-->|->|--\)|-\)|--x|-x)\s*[+-]?(\S+)\s*:/i.exec(line);
		if (message) {
			actors.add(message[1]!);
			actors.add(message[2]!);
		}
	}

	return Math.max(actors.size, 1);
}

function wrapLabel(label: string, width: number): string {
	const lines = label.split(/<br\s*\/?>(?:\s*)/i).flatMap((line) => wrapLine(line, width));
	return lines.join("<br>");
}

function wrapLine(line: string, width: number): string[] {
	const words = line.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [""];

	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (visibleWidth(word) > width) {
			if (current) {
				lines.push(current);
				current = "";
			}

			let chunk = "";
			for (const character of Array.from(word)) {
				if (chunk && visibleWidth(`${chunk}${character}`) > width) {
					lines.push(chunk);
					chunk = "";
				}
				chunk += character;
			}
			if (chunk) current = chunk;
			continue;
		}

		if (!current) {
			current = word;
		} else if (visibleWidth(`${current} ${word}`) <= width) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}

	if (current) lines.push(current);
	return lines;
}
