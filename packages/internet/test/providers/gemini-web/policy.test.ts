import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GeminiNativeConversationPolicy } from "#runtime/providers/gemini-web/conversation/policy";

describe("Gemini native conversation policy", () => {
	it("records and reopens only safe conversation URLs inside its state directory", () => {
		const stateDir = mkdtempSync(join(tmpdir(), "gemini-web-policy-"));
		const policy = new GeminiNativeConversationPolicy({ conversationStateDir: stateDir });
		policy.record("pi-session-fixture", "https://gemini.google.com/app/abc123");
		expect(policy.resolve("pi-session-fixture")).toBe("https://gemini.google.com/app/abc123");
		const [stateFile] = readdirSync(stateDir);
		const hash = createHash("sha256").update("pi-session-fixture").digest("hex");
		expect(stateFile).toBe(`${hash}.json`);
		const stored = readFileSync(join(stateDir, stateFile!), "utf8");
		expect(stored).toContain('"provider": "gemini-web"');
		expect(stored).not.toContain("pi-session-fixture");
	});

	it("rejects unsafe URLs and enforces one Gemini chat per Pi session", () => {
		const stateDir = mkdtempSync(join(tmpdir(), "gemini-web-policy-"));
		const policy = new GeminiNativeConversationPolicy({ conversationStateDir: stateDir });
		expect(() => policy.record("pi-session-fixture", "https://example.com/app/abc123")).toThrow("unsafe");
		policy.record("pi-session-fixture", "https://gemini.google.com/app/abc123");
		expect(() => policy.record("pi-session-fixture", "https://gemini.google.com/app/def456")).toThrow(
			"identity changed",
		);
		expect(() => policy.record("pi-session-other", "https://gemini.google.com/app/abc123")).toThrow("already bound");
		expect(policy.resolve("pi-session-missing")).toBeUndefined();
	});
});
