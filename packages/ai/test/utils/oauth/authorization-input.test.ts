import { describe, expect, it } from "vitest";
import { parseOAuthAuthorizationInput } from "#ai/auth/oauth/authorization-input";

describe("parseOAuthAuthorizationInput", () => {
	it("returns no fields for blank input", () => {
		expect(parseOAuthAuthorizationInput("  \n\t  ")).toEqual({});
	});

	it("parses redirect URLs", () => {
		expect(parseOAuthAuthorizationInput("https://example.com/callback?code=abc&state=xyz")).toEqual({
			code: "abc",
			state: "xyz",
		});
	});

	it("parses code and state separated by hash", () => {
		expect(parseOAuthAuthorizationInput("abc#xyz")).toEqual({ code: "abc", state: "xyz" });
	});

	it("parses raw query strings", () => {
		expect(parseOAuthAuthorizationInput("code=abc&state=xyz")).toEqual({ code: "abc", state: "xyz" });
	});

	it("falls back to raw code for malformed URLs and plain input", () => {
		expect(parseOAuthAuthorizationInput("https://%zz")).toEqual({ code: "https://%zz" });
		expect(parseOAuthAuthorizationInput("abc")).toEqual({ code: "abc" });
	});
});
