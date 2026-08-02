import type { TaskExecutionReceipt } from "@tsuuanmi/pi-orchestrator";

export interface TeamTaskReceiptRef {
	package: "@tsuuanmi/pi-orchestrator";
	type: "task";
	id: string;
	task_id: string;
}

export function mapTaskReceipt(receipt: TaskExecutionReceipt): TeamTaskReceiptRef {
	const id = requiredString(receipt.receiptId, "receipt.receiptId");
	const taskId = requiredString(receipt.taskId, "receipt.taskId");
	return Object.freeze({
		package: "@tsuuanmi/pi-orchestrator",
		type: "task",
		id,
		task_id: taskId,
	});
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	if (value.trim().length === 0) throw new Error(`${field} must be non-empty`);
	if (value.trim() !== value) throw new Error(`${field} must not have surrounding whitespace`);
	return value;
}
