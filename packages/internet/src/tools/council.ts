import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import type { CouncilService } from "#internet/council/service";

export function registerCouncilTool(
	host: Pick<ExtensionAPI, "registerTool">,
	council: Pick<CouncilService, "run">,
): void {
	host.registerTool({
		name: "internet_council",
		label: "Internet Council",
		description: "Run bounded independent analyses across internet models and synthesize one answer.",
		parameters: Type.Object({
			question: Type.String({ minLength: 1 }),
			preset: Type.Optional(Type.Union([Type.Literal("quick"), Type.Literal("balanced"), Type.Literal("deep")])),
			members: Type.Optional(
				Type.Array(Type.String({ minLength: 3 }), { minItems: 2, maxItems: 6, uniqueItems: true }),
			),
			chair: Type.Optional(Type.String({ minLength: 3 })),
		}),
		async execute(_id, params, signal, _onUpdate, context) {
			const result = await council.run(
				{
					question: params.question,
					preset: params.preset ?? "balanced",
					members: params.members,
					chair: params.chair,
					signal,
				},
				context.sessionServices,
			);
			return { content: [{ type: "text", text: result.answer }], details: result };
		},
	});
}
