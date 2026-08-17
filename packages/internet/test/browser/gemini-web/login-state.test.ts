import {
	browserLoginStateExists,
	inspectGeminiAuthEvidence,
	validateVerifiedGeminiCapabilityMarker,
} from "#runtime/browser/gemini-web/auth";
import { sanitizeGeminiStorageState } from "#runtime/browser/gemini-web/login-state";

const googleCookie = {
	name: "SID",
	value: "sanitized-fixture-value",
	domain: ".google.com",
	path: "/",
	expires: -1,
	httpOnly: true,
	secure: true,
	sameSite: "Lax" as const,
};

const marker = {
	version: 1 as const,
	provider: "gemini-web" as const,
	authenticatedAt: "2026-08-17T00:00:00.000Z",
	signOutHref: "https://accounts.google.com/SignOutOptions",
	capabilities: {
		version: 1 as const,
		provider: "gemini-web" as const,
		verifiedAt: "2026-08-17T00:00:00.000Z",
		labels: { flash: "3.6 Flash", thinking: "3.6 Thinking", pro: "3.1 Pro" },
		available: ["flash", "thinking", "pro"],
	},
};

describe("Gemini login state", () => {
	it("keeps only Google cookies and the Gemini origin", () => {
		expect(
			sanitizeGeminiStorageState({
				cookies: [
					googleCookie,
					{ ...googleCookie, domain: "accounts.google.com" },
					{ ...googleCookie, domain: ".example.com" },
				],
				origins: [
					{ origin: "https://gemini.google.com", localStorage: [{ name: "theme", value: "dark" }] },
					{ origin: "https://accounts.google.com", localStorage: [{ name: "secret", value: "discard" }] },
				],
			}),
		).toEqual({
			cookies: [googleCookie, { ...googleCookie, domain: "accounts.google.com" }],
			origins: [{ origin: "https://gemini.google.com", localStorage: [{ name: "theme", value: "dark" }] }],
		});
	});

	it("rejects state without an allowed Google cookie", () => {
		expect(() =>
			sanitizeGeminiStorageState({ cookies: [{ ...googleCookie, domain: ".example.com" }], origins: [] }),
		).toThrow("no allowed cookies");
	});

	it("uses only the verified account link or the explicit sign-in button", () => {
		expect(
			inspectGeminiAuthEvidence({ signOutHref: "https://accounts.google.com/SignOutOptions", signInVisible: false })
				.status,
		).toBe("signed-in");
		expect(
			inspectGeminiAuthEvidence({ signOutHref: "https://accounts.google.com/SignOutOptions", signInVisible: true })
				.status,
		).toBe("signed-out");
		expect(inspectGeminiAuthEvidence({ signOutHref: undefined, signInVisible: false }).status).toBe("unknown");
	});

	it("validates a verified capability marker without exposing state values", () => {
		expect(validateVerifiedGeminiCapabilityMarker(marker).capabilities.available).toEqual([
			"flash",
			"thinking",
			"pro",
		]);
	});

	it("does not treat composer-only state as authenticated", () => {
		expect(inspectGeminiAuthEvidence({ signOutHref: undefined, signInVisible: false })).toMatchObject({
			status: "unknown",
		});
		expect(browserLoginStateExists("/path/that/does/not/exist")).toBe(false);
	});
});
