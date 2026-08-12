import type { InternetAccount, InternetControlAction } from "#internet/core/types";

describe("internet core types", () => {
	it("represent a loopback account and supported control action", () => {
		const account: InternetAccount = {
			id: "default",
			backend: "openai",
			displayName: "ChatGPT Web",
			configDir: "/tmp/chatgpt-web",
			host: "127.0.0.1",
			port: 17841,
			enabled: true,
		};
		const action: InternetControlAction = "drain";
		expect(account.backend).toBe("openai");
		expect(action).toBe("drain");
	});
});
