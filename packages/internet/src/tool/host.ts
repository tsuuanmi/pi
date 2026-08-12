import type { TSchema } from "typebox";
import type { InternetToolSpec } from "#internet/tool/spec";

export interface InternetToolHost {
	registerTool<TParams extends TSchema = TSchema, TDetails = unknown>(tool: InternetToolSpec<TParams, TDetails>): void;
}
