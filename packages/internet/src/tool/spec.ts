import type { ContextToolSpec } from "@tsuuanmi/pi-agent";
import type { TSchema } from "typebox";
import type { InternetContext } from "#internet/core/types";

export interface InternetToolSpec<TParams extends TSchema = TSchema, TDetails = unknown>
	extends ContextToolSpec<InternetContext, TParams, TDetails> {
	renderShell?: "default" | "self";
}
