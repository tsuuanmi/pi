import { CHATGPT_WEB_PROVIDER_ID } from "@tsuuanmi/pi-web-runtime";
import { describe, expect, test } from "vitest";
import type { AuthStorage, BrowserCredential } from "#pi/auth/storage";
import { getEntitledWebModels } from "#pi/web-providers/models";

const credential: BrowserCredential = {
	type: "browser",
	profileId: "a".repeat(32),
	tunnelSecret: "a".repeat(32),
};

function getModels(routes: readonly string[]): ReturnType<typeof getEntitledWebModels> {
	const storage = {
		getActiveAccount: () => "work",
		getBrowserAccount: () => credential,
	} as unknown as AuthStorage;
	return getEntitledWebModels(
		{
			getEntitlement: () => routes,
			list: () => [
				{
					id: CHATGPT_WEB_PROVIDER_ID,
					models: [
						{ id: "light", name: "Light", contextWindow: 1, input: ["text"], output: ["text"] },
						{ id: "high", name: "High", contextWindow: 1, input: ["text"], output: ["text"] },
					],
				},
			],
		},
		storage,
	);
}

describe("getEntitledWebModels", () => {
	test("returns only active verified routes", () => {
		expect(getModels(["high"])).toEqual([
			expect.objectContaining({ provider: CHATGPT_WEB_PROVIDER_ID, model: expect.objectContaining({ id: "high" }) }),
		]);
	});

	test("rejects stale and duplicate runtime routes", () => {
		expect(() => getModels(["missing"])).toThrow("unknown entitled route");
		expect(() => getModels(["high", "high"])).toThrow("duplicate entitled route");
	});
});
