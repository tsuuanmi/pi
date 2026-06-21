export interface WorkflowReceipt {
	ok: boolean;
	[key: string]: unknown;
}

export function workflowReceipt(fields: Record<string, unknown> = {}): WorkflowReceipt {
	return { ok: true, ...fields };
}
