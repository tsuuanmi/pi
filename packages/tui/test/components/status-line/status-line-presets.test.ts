import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPreset, STATUS_LINE_PRESETS } from "#tui/index";

describe("STATUS_LINE_PRESETS.default", () => {
	it("uses the Pi segment ids with the agreed multi-row split", () => {
		assert.deepEqual(STATUS_LINE_PRESETS.default.modelSegments, ["model", "context_pct", "token_in", "token_out"]);
		assert.deepEqual(STATUS_LINE_PRESETS.default.environmentSegments, ["git", "path"]);
	});

	it("uses the slash separator", () => {
		assert.equal(STATUS_LINE_PRESETS.default.separator, "slash");
	});

	it("enables the thinking fold + provider prefix on the model segment", () => {
		assert.equal(STATUS_LINE_PRESETS.default.segmentOptions?.model?.showThinkingLevel, true);
		assert.equal(STATUS_LINE_PRESETS.default.segmentOptions?.model?.showProviderPrefix, true);
	});

	it("includes no unsupported segments (pr, jobs, cost, token_rate, usage, hostname)", () => {
		const all = [...STATUS_LINE_PRESETS.default.modelSegments, ...STATUS_LINE_PRESETS.default.environmentSegments];
		for (const dropped of ["pr", "jobs", "cost", "token_rate", "usage", "hostname", "icon", "time"]) {
			assert.ok(!all.includes(dropped as never));
		}
	});
});

describe("getPreset", () => {
	it("returns the default preset for undefined", () => {
		assert.equal(getPreset(undefined), STATUS_LINE_PRESETS.default);
	});

	it("returns the custom preset", () => {
		assert.equal(getPreset("custom"), STATUS_LINE_PRESETS.custom);
	});

	it("falls back to default for an unknown name", () => {
		assert.equal(getPreset("bogus" as never), STATUS_LINE_PRESETS.default);
	});

	it("custom mirrors default so user overrides land on a known base", () => {
		assert.deepEqual(STATUS_LINE_PRESETS.custom.modelSegments, STATUS_LINE_PRESETS.default.modelSegments);
		assert.deepEqual(STATUS_LINE_PRESETS.custom.environmentSegments, STATUS_LINE_PRESETS.default.environmentSegments);
	});
});
