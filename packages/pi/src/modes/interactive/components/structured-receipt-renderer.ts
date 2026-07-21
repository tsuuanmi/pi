import type { StructuredReceipt } from "@tsuuanmi/pi-agent";
import { Text, type Theme } from "@tsuuanmi/pi-tui";

function formatValue(value: string | number | boolean): string {
	return typeof value === "string" ? value : String(value);
}

function formatLocationSummary(location: StructuredReceipt["location"]): string {
	const preferredKeys = [
		"cwd",
		"sessionId",
		"toolCallId",
		"toolName",
		"subagentId",
		"tmuxSession",
		"tmuxPane",
		"artifactPath",
	];
	const entries = Object.entries(location);
	for (const key of preferredKeys) {
		const match = entries.find(([entryKey]) => entryKey === key);
		if (match) return `${match[0]}=${formatValue(match[1])}`;
	}
	const first = entries[0];
	return first ? `${first[0]}=${formatValue(first[1])}` : "n/a";
}

export function formatStructuredReceiptLines(receipt: StructuredReceipt, expanded: boolean): string[] {
	const lines = [
		`Receipt: ${receipt.actionSummary}`,
		`Status: ${receipt.status}`,
		`Where: ${formatLocationSummary(receipt.location)}`,
	];
	if (receipt.inspect.length > 0) {
		const first = receipt.inspect[0];
		lines.push(`Inspect: ${first.label}: ${first.value}`);
	}
	if (!expanded) return lines;
	if (receipt.timing.startedAt) lines.push(`Started: ${receipt.timing.startedAt}`);
	if (receipt.timing.endedAt) lines.push(`Ended: ${receipt.timing.endedAt}`);
	if (receipt.timing.durationMs !== undefined) lines.push(`Duration: ${receipt.timing.durationMs}ms`);
	if (receipt.outputPreview) lines.push(`Preview: ${receipt.outputPreview}`);
	if (receipt.errorSummary) lines.push(`Error: ${receipt.errorSummary}`);
	for (const inspect of receipt.inspect) {
		lines.push(`Inspect: ${inspect.label}: ${inspect.value}`);
	}
	return lines;
}

export function renderStructuredReceipt(receipt: StructuredReceipt, expanded: boolean, _theme: Theme): Text {
	return new Text(formatStructuredReceiptLines(receipt, expanded).join("\n"), 0, 0);
}
