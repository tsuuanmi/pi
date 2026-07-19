import type { Agent } from "@tsuuanmi/pi-agent";
import type { ExtensionRunner } from "#coding-agent/extensions/index";

/** Install the Agent-level bridge for extension tool hooks. */
export function installAgentToolHooks(agent: Agent, runner: ExtensionRunner): void {
	agent.beforeToolCall = async ({ toolCall, args }) => {
		if (!runner.hasHandlers("tool_call")) {
			return undefined;
		}

		try {
			return await runner.emitToolCall({
				type: "tool_call",
				toolName: toolCall.name,
				toolCallId: toolCall.id,
				input: args as Record<string, unknown>,
			});
		} catch (err) {
			if (err instanceof Error) {
				throw err;
			}
			throw new Error(`Extension failed, blocking execution: ${String(err)}`);
		}
	};

	agent.afterToolCall = async ({ toolCall, args, result, isError }) => {
		if (!runner.hasHandlers("tool_result")) {
			return undefined;
		}

		const hookResult = await runner.emitToolResult({
			type: "tool_result",
			toolName: toolCall.name,
			toolCallId: toolCall.id,
			input: args as Record<string, unknown>,
			content: result.content,
			details: result.details,
			isError,
		});

		if (!hookResult) {
			return undefined;
		}

		return {
			content: hookResult.content,
			details: hookResult.details,
			isError: hookResult.isError ?? isError,
		};
	};
}
