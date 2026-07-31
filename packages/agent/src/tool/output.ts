import type { TextContent } from "@tsuuanmi/pi-ai";

export interface ToolOutputLimit {
	maxChars?: number;
}

export interface ToolOutputStats {
	truncated: boolean;
	originalChars: number;
	emittedChars: number;
}

export interface LimitedToolOutput {
	content: TextContent[];
	stats: ToolOutputStats;
}

const TRUNCATION_LABEL = "tool output truncated";

export function normalizeToolOutputLimit(maxChars: number | undefined): number | undefined {
	if (maxChars === undefined || !Number.isFinite(maxChars)) {
		return undefined;
	}
	return Math.max(1, Math.floor(maxChars));
}

export function limitToolOutput(content: TextContent[], limit: ToolOutputLimit): LimitedToolOutput {
	const maxChars = normalizeToolOutputLimit(limit.maxChars);
	const originalChars = countTextChars(content);
	if (maxChars === undefined || originalChars <= maxChars) {
		return {
			content,
			stats: { truncated: false, originalChars, emittedChars: originalChars },
		};
	}

	const marker = `\n[${TRUNCATION_LABEL}: kept ${maxChars} of ${originalChars} chars]`;
	const truncated = truncateTextContent(content, maxChars, marker);
	return {
		content: truncated,
		stats: {
			truncated: true,
			originalChars,
			emittedChars: countTextChars(truncated),
		},
	};
}

function countTextChars(content: TextContent[]): number {
	return content.reduce((count, item) => count + (item.type === "text" ? item.text.length : 0), 0);
}

function truncateTextContent(content: TextContent[], maxChars: number, marker: string): TextContent[] {
	const truncated: TextContent[] = [];
	let remainingChars = maxChars;
	let markerAdded = false;

	for (const item of content) {
		if (item.type !== "text") {
			truncated.push(item);
			continue;
		}

		if (remainingChars <= 0) {
			continue;
		}

		const text = item.text.slice(0, remainingChars);
		remainingChars -= text.length;
		truncated.push({ ...item, text: remainingChars === 0 ? `${text}${marker}` : text });
		markerAdded = remainingChars === 0;
	}

	if (!markerAdded) {
		truncated.push({ type: "text", text: marker });
	}

	return truncated;
}
