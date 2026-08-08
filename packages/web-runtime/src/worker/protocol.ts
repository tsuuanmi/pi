import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { WebAttachment, WebTool, WebTurnEvent } from "../types.ts";

export interface WorkerTurn {
	id: string;
	provider: string;
	model: string;
	prompt: string;
	attachments: readonly WebAttachment[];
	tools: readonly WebTool[];
	capability: string;
}

export type WorkerRequest =
	| { type: "open-profile"; profileId: string; profileDir: string; tunnelSecret: string }
	| { type: "start-turn"; turn: WorkerTurn }
	| { type: "cancel-turn"; turnId: string }
	| { type: "mcp-response"; turnId: string; message: JSONRPCMessage }
	| { type: "close-profile" };

export type WorkerMessage =
	| { type: "profile-ready"; profileId: string; proof: string }
	| { type: "profile-closed" }
	| { type: "profile-error"; message: string }
	| { type: "mcp-request"; turnId: string; message: JSONRPCMessage }
	| { type: "event"; turnId: string; event: Exclude<WebTurnEvent, { type: "tool-call" }> }
	| { type: "complete"; turnId: string }
	| { type: "error"; turnId: string; message: string };
