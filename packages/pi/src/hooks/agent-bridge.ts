import type { Agent } from "@tsuuanmi/pi-agent";
import type { ExtensionRunner } from "#pi/runtime/extensions/runner";

/** Install the agent bridge for extension tool hooks. */
export function installToolHooks(agent: Agent, runner: ExtensionRunner): () => void {
	return agent.registerHook({
		name: "pi.extensions",
		beforeToolCall: async ({ toolCall, args }) => {
			if (!runner.hasHookHandlers("tool_call")) {
				return undefined;
			}

			try {
				return await runner.runToolCallHook({
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
		},
		afterToolCall: async ({ toolCall, args, result, isError }) => {
			if (!runner.hasHookHandlers("tool_result")) {
				return undefined;
			}

			const hookResult = await runner.runToolResultHook({
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
		},
	});
}
