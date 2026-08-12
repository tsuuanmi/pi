import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import { isLunaModel } from "#internet/backends/openai/turn/model";
import type { InternetToolHost } from "#internet/tool/host";

export function registerCompactTools(host: InternetToolHost): void {
	host.registerTool({
		name: "internet_compact",
		label: "Internet Compact",
		description: "Compact ChatGPT Web conversation history through the local daemon.",
		parameters: Type.Object({
			account: Type.Optional(Type.String({ minLength: 1 })),
			model: Type.String({ minLength: 1 }),
			input: Type.Array(Type.Unknown(), { minItems: 1 }),
			instructions: Type.Optional(Type.String({ minLength: 1 })),
		}),
		async execute(_id, params, signal) {
			if (isLunaModel(params.model)) {
				throw new Error("Separate compaction is disabled for Luna because it uses rolling checkpoints.");
			}
			const account = await new AccountRegistry().get(params.account);
			const client = await DaemonClient.forAccount(account);
			const result = await client.compact(
				{ model: params.model, input: params.input, instructions: params.instructions },
				signal,
			);
			return {
				content: [{ type: "text", text: JSON.stringify(result.output, null, 2) }],
				details: result,
			};
		},
	});
}
