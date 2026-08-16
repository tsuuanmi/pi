import { sanitizeChatGptStorageState } from "../../vendor/runtime/src/providers/chatgpt-web/browser/login-state.js";

const cookie = {
	name: "session",
	value: "private",
	domain: ".chatgpt.com",
	path: "/",
	expires: -1,
	httpOnly: true,
	secure: true,
	sameSite: "Lax",
};

describe("ChatGPT login-state import", () => {
	it("retains only ChatGPT and OpenAI browser state", () => {
		expect(
			sanitizeChatGptStorageState({
				cookies: [cookie, { ...cookie, domain: ".example.com" }],
				origins: [
					{ origin: "https://chatgpt.com", localStorage: [{ name: "theme", value: "dark" }] },
					{ origin: "https://example.com", localStorage: [{ name: "secret", value: "discard" }] },
				],
			}),
		).toEqual({
			cookies: [cookie],
			origins: [{ origin: "https://chatgpt.com", localStorage: [{ name: "theme", value: "dark" }] }],
		});
	});

	it("rejects state without relevant cookies", () => {
		expect(() => sanitizeChatGptStorageState({ cookies: [], origins: [] })).toThrow("no ChatGPT or OpenAI cookies");
	});
});
