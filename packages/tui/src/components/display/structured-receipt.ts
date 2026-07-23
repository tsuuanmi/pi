import type { StructuredReceipt } from "@tsuuanmi/pi-agent";
import { Text } from "#tui/components/display/text";
import type { Theme } from "#tui/theme/theme";

function formatStatus(status: StructuredReceipt["status"], theme?: Theme): string {
	const label = `Status: ${status}`;
	if (!theme) return label;
	switch (status) {
		case "completed":
			return theme.fg("success", label);
		case "failed":
			return theme.fg("error", label);
		case "cancelled":
			return theme.fg("muted", label);
		default:
			return theme.fg("warning", label);
	}
}

function shouldHideBuiltinCommandDetails(receipt: StructuredReceipt): boolean {
	return receipt.source === "builtin-tool" && receipt.location.command !== undefined;
}

export function formatStructuredReceiptLines(receipt: StructuredReceipt, expanded: boolean, theme?: Theme): string[] {
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

export function renderStructuredReceipt(receipt: StructuredReceipt, expanded: boolean, theme: Theme): Text {
	return new Text(formatStructuredReceiptLines(receipt, expanded, theme).join("\n"), 0, 0);
}
