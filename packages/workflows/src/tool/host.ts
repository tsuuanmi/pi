import type { TSchema } from "typebox";
import type { WorkflowToolSpec } from "#workflows/tool/spec";

export interface WorkflowToolHost {
	registerTool<TParams extends TSchema = TSchema, TDetails = unknown>(tool: WorkflowToolSpec<TParams, TDetails>): void;
}
