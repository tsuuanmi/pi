import { Text } from "#tui/components/display/text";
import type { Theme } from "#tui/theme/theme";

export interface StructuredReceiptDisplayModel {
	actionSummary: string;
	status: "queued" | "started" | "running" | "paused" | "completed" | "failed" | "cancelled";
	source?: string;
	location: {
		command?: string;
	};
	inspect: Array<{
		label: string;
		value: string;
		kind?: string;
	}>;
	timing: {
		startedAt?: string;
		endedAt?: string;
		durationMs?: number;
	};
	outputPreview?: string;
	errorSummary?: string;
}

function formatStatus(status: StructuredReceiptDisplayModel["status"], theme?: Theme): string {
	const label = `Status: ${status}`;
	if (!theme) return label;
	switch (status) {
		case "completed":
			return theme.fg("success", label);
		case "failed":
			return theme.fg("error", label);
		case "cancelled":
			return theme.fg("muted", label);
		case "queued":
		case "started":
		case "running":
			return theme.fg("warning", label);
		case "paused":
			return theme.fg("muted", label);
		default:
			return label;
	}
}

function shouldHideBuiltinCommandDetails(receipt: StructuredReceiptDisplayModel): boolean {
	return receipt.source === "tool" && receipt.location.command !== undefined;
}

export function formatStructuredReceiptLines(
	receipt: StructuredReceiptDisplayModel,
	expanded: boolean,
	theme?: Theme,
): string[] {
	const summaryParts = [`Receipt: ${receipt.actionSummary}`, formatStatus(receipt.status, theme)];
	const lines = [summaryParts.join(" • ")];
	if (!shouldHideBuiltinCommandDetails(receipt) && receipt.inspect.length > 0) {
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
		if (shouldHideBuiltinCommandDetails(receipt) && inspect.kind === "command") continue;
		lines.push(`Inspect: ${inspect.label}: ${inspect.value}`);
	}
	return lines;
}

export function renderStructuredReceipt(receipt: StructuredReceiptDisplayModel, expanded: boolean, theme: Theme): Text {
	return new Text(formatStructuredReceiptLines(receipt, expanded, theme).join("\n"), 0, 0);
}
