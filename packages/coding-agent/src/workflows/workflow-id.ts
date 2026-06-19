import { randomBytes } from "node:crypto";

export function defaultWorkflowId(prefix: string): string {
	const date = new Date();
	const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
	const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
	const dd = date.getUTCDate().toString().padStart(2, "0");
	const hh = date.getUTCHours().toString().padStart(2, "0");
	const min = date.getUTCMinutes().toString().padStart(2, "0");
	return `${prefix}-${yyyy}-${mm}-${dd}-${hh}${min}-${randomBytes(2).toString("hex")}`;
}
