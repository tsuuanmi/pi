import type { AgentLoopConfig } from "#agent/config";
import type { AgentHook, AgentLoopTurnUpdate } from "#agent/hooks";

export function createLoopHooks(
	hooks: readonly AgentHook[],
	getSignal: () => AbortSignal | undefined,
): Pick<AgentLoopConfig, "beforeToolCall" | "afterToolCall" | "prepareNextTurn"> {
	const beforeToolCall: AgentLoopConfig["beforeToolCall"] = hooks.some((hook) => hook.beforeToolCall)
		? async (context, signal) => {
				for (const hook of hooks) {
					const result = await hook.beforeToolCall?.(context, signal);
					if (result?.block) {
						return result;
					}
				}
				return undefined;
			}
		: undefined;

	const afterToolCall: AgentLoopConfig["afterToolCall"] = hooks.some((hook) => hook.afterToolCall)
		? async (context, signal) => {
				let result = context.result;
				let isError = context.isError;
				let changed = false;

				for (const hook of hooks) {
					const next = await hook.afterToolCall?.({ ...context, result, isError }, signal);
					if (!next) {
						continue;
					}

					changed = true;
					result = {
						content: next.content ?? result.content,
						details: next.details ?? result.details,
						terminate: next.terminate ?? result.terminate,
					};
					isError = next.isError ?? isError;
				}

				return changed ? { ...result, isError } : undefined;
			}
		: undefined;

	const prepareNextTurn: AgentLoopConfig["prepareNextTurn"] = hooks.some((hook) => hook.prepareNextTurn)
		? async (context) => {
				let update: AgentLoopTurnUpdate | undefined;
				for (const hook of hooks) {
					const next = await hook.prepareNextTurn?.(context, getSignal());
					if (!next) {
						continue;
					}

					if (next.context !== undefined) {
						update = { ...(update ?? {}), context: next.context };
					}
					if (next.model !== undefined) {
						update = { ...(update ?? {}), model: next.model };
					}
					if (next.thinkingLevel !== undefined) {
						update = { ...(update ?? {}), thinkingLevel: next.thinkingLevel };
					}
				}
				return update;
			}
		: undefined;

	return { beforeToolCall, afterToolCall, prepareNextTurn };
}
