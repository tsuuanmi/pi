import { CHATGPT_WEB_PROVIDER_ID } from "@tsuuanmi/pi-web-runtime";
import { describe, expect, test } from "vitest";
import type { BrowserCredential } from "#pi/auth/storage";
import { runWebTurn, type WebTurnRequest } from "#pi/web-providers/turn";

const credential: BrowserCredential = {
	type: "browser",
	profileId: "profile-1234567890123456",
	tunnelSecret: "secret",
};

const request: WebTurnRequest = {
	provider: CHATGPT_WEB_PROVIDER_ID,
	account: "work",
	credential,
	model: "high",
	prompt: "hello",
	attachments: [],
	tools: [],
	executeTool: async () => undefined,
	onEvent: async () => {},
	signal: new AbortController().signal,
};

const host = {
	get: () => ({ models: [{ id: "high" }] }),
	getWorkerPath: () => "/worker.js",
	getEntitlement: () => undefined,
};

describe("runWebTurn", () => {
	test("rejects a route after entitlement is cleared", async () => {
		await expect(runWebTurn(host, request)).rejects.toThrow("not entitled");
	});
});
