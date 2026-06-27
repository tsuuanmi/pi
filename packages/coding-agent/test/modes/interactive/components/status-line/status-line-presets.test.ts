import { describe, expect, it } from "vitest";
import { getPreset, STATUS_LINE_PRESETS } from "../../../../../src/modes/interactive/components/status-line/presets.ts";

describe("STATUS_LINE_PRESETS.default", () => {
	it("uses the 10 Pi segment ids with the agreed left/right split", () => {
		expect(STATUS_LINE_PRESETS.default.leftSegments).toEqual(["model", "mode", "git", "path"]);
		expect(STATUS_LINE_PRESETS.default.rightSegments).toEqual([
			"session_name",
			"subagents",
			"token_in",
			"token_out",
			"context_pct",
			"context_total",
		]);
	});

	it("uses the slash separator", () => {
		expect(STATUS_LINE_PRESETS.default.separator).toBe("slash");
	});

	it("enables the thinking fold + provider prefix on the model segment", () => {
		expect(STATUS_LINE_PRESETS.default.segmentOptions?.model?.showThinkingLevel).toBe(true);
		expect(STATUS_LINE_PRESETS.default.segmentOptions?.model?.showProviderPrefix).toBe(true);
	});

	it("includes no dropped gajae segments (pr, jobs, cost, token_rate, usage, hostname)", () => {
		const all = [...STATUS_LINE_PRESETS.default.leftSegments, ...STATUS_LINE_PRESETS.default.rightSegments];
		for (const dropped of ["pr", "jobs", "cost", "token_rate", "usage", "hostname", "icon", "time"]) {
			expect(all).not.toContain(dropped);
		}
	});
});

describe("getPreset", () => {
	it("returns the default preset for undefined", () => {
		expect(getPreset(undefined)).toBe(STATUS_LINE_PRESETS.default);
	});

	it("returns the custom preset", () => {
		expect(getPreset("custom")).toBe(STATUS_LINE_PRESETS.custom);
	});

	it("falls back to default for an unknown name", () => {
		expect(getPreset("bogus" as never)).toBe(STATUS_LINE_PRESETS.default);
	});

	it("custom mirrors default so user overrides land on a known base", () => {
		expect(STATUS_LINE_PRESETS.custom.leftSegments).toEqual(STATUS_LINE_PRESETS.default.leftSegments);
		expect(STATUS_LINE_PRESETS.custom.rightSegments).toEqual(STATUS_LINE_PRESETS.default.rightSegments);
	});
});
