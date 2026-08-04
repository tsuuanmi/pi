import { createSubagentReceipt, withStructuredReceipt } from "@tsuuanmi/pi-agent";
import type { SubagentRecord } from "#pi/subagents/types";

export function attachControlReceipt<TDetails extends { record?: SubagentRecord }>(
	details: TDetails,
	sessionId: string,
): TDetails {
	if (!details.record) return details;
	return withStructuredReceipt(details, createSubagentReceipt(details.record, sessionId));
}
