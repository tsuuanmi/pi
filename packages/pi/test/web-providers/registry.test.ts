import { CHATGPT_WEB_PROVIDER_ID } from "@tsuuanmi/pi-web-runtime";
import { describe, expect, test } from "vitest";
import type { AuthStorage } from "#pi/auth/storage";
import type { ProviderConfigInput } from "#pi/loader/model-registry";
import { WebProviderRegistry } from "#pi/web-providers/registry";

const stream = (() => {
	throw new Error("stream is not called in this test");
}) as NonNullable<ProviderConfigInput["stream"]>;

describe("WebProviderRegistry", () => {
	test("registers only current entitled routes and clears them", () => {
		const registered = new Map<string, ProviderConfigInput>();
		const host = {
			getActiveModels: () => [
				{
					provider: CHATGPT_WEB_PROVIDER_ID,
					model: {
						id: "high",
						name: "High",
						contextWindow: 1,
						input: ["text"] as const,
						output: ["text"] as const,
					},
				},
			],
		};
		const registry = new WebProviderRegistry(
			host,
			{} as AuthStorage,
			{
				registerProvider: (name, config) => registered.set(name, config),
				unregisterProvider: (name) => registered.delete(name),
			},
			() => stream,
		);

		registry.sync();
		expect(registered.get(CHATGPT_WEB_PROVIDER_ID)?.api).toBe("web");
		expect(registered.get(CHATGPT_WEB_PROVIDER_ID)?.models?.[0]?.id).toBe("high");
		registry.clear();
		expect(registered.size).toBe(0);
	});
});
