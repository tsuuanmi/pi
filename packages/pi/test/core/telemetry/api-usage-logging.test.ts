import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apiUsageLogPath } from "#pi/telemetry/api-usage-utils";
import { createHarness } from "#pi-test/unit-harness";

async function waitForFile(path: string): Promise<string> {
	for (let i = 0; i < 50; i++) {
		if (existsSync(path)) return readFileSync(path, "utf8");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`file not written: ${path}`);
}

describe("ApiUsageLogger", () => {
	it("writes one redacted JSONL sidecar record per completed provider invocation", async () => {
		const harness = createHarness({ responses: ["ok"] });
		try {
			await harness.session.prompt("hello Bearer abcdefghijklmnopqrstuvwxyz");
			const logPath = apiUsageLogPath(harness.tempDir, harness.sessionManager.getSessionId());
			expect(logPath).toBe(join(harness.tempDir, ".pi", harness.sessionManager.getSessionId(), "api-usage.jsonl"));
			const content = await waitForFile(logPath!);
			const lines = content.trim().split("\n");
			expect(lines).toHaveLength(1);
			const record = JSON.parse(lines[0]);
			expect(record.schema_version).toBe(1);
			expect(record.session_id).toBe(harness.sessionManager.getSessionId());
			expect(record.provider).toBe("faux");
			expect(record.consumed_context.messages[0].content[0].text).toContain("[REDACTED]");
			expect(record.usage_unavailable).toBe("usage_provenance_missing");
			expect(record.token_usage).toBeUndefined();
		} finally {
			harness.cleanup();
		}
	});

	it("honors apiUsageLogging.enabled=false", async () => {
		const harness = createHarness({ settings: { apiUsageLogging: { enabled: false } }, responses: ["ok"] });
		try {
			await harness.session.prompt("hello");
			await new Promise((resolve) => setTimeout(resolve, 30));
			const logPath = apiUsageLogPath(harness.tempDir, harness.sessionManager.getSessionId());
			expect(existsSync(logPath!)).toBe(false);
		} finally {
			harness.cleanup();
		}
	});
});
