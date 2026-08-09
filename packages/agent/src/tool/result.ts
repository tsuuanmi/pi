import type { TextContent } from "@tsuuanmi/pi-ai";

export interface ToolResult<TDetails = unknown> {
	content: TextContent[];
	details: TDetails;
	terminate?: boolean;
}

export type ToolUpdate<TDetails = unknown> = (partialResult: ToolResult<TDetails>) => void;
