import type { ContextToolSpec } from "@tsuuanmi/pi-agent";
import type { TSchema } from "typebox";
import type { WorkflowContext } from "#workflows/tool/context";

export interface WorkflowToolSpec<TParams extends TSchema = TSchema, TDetails = unknown>
	extends ContextToolSpec<WorkflowContext, TParams, TDetails> {
	renderShell?: "default" | "self";
}
