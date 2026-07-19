import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getContextUsageLevel, getContextUsageThemeColor } from "#tui/index";

// Thresholds (context-thresholds.ts): warning 50% / 150k, purple 70% / 270k,
// error 90% / 500k. A level trips at min(percentThreshold, tokenPercentThreshold)
// where tokenPercentThreshold = tokenThreshold / contextWindow * 100.

describe("getContextUsageLevel — 200k window (percent thresholds win)", () => {
	const window = 200_000;

	it("normal below the warning threshold", () => {
		assert.equal(getContextUsageLevel(0, window), "normal");
		assert.equal(getContextUsageLevel(49.9, window), "normal");
	});

	it("warning at 50% boundary", () => {
		assert.equal(getContextUsageLevel(50, window), "warning");
		assert.equal(getContextUsageLevel(69.9, window), "warning");
	});

	it("purple at 70% boundary", () => {
		assert.equal(getContextUsageLevel(70, window), "purple");
		assert.equal(getContextUsageLevel(89.9, window), "purple");
	});

	it("error at 90% boundary", () => {
		assert.equal(getContextUsageLevel(90, window), "error");
		assert.equal(getContextUsageLevel(100, window), "error");
	});
});

describe("getContextUsageLevel — large window trips via absolute tokens first", () => {
	// 400k window: warning token pct = 150k/400k*100 = 37.5% < 50%, so the token
	// threshold wins and warning trips at 37.5%.
	const window = 400_000;

	it("trips warning at 38% via the token threshold (below the 50% percent gate)", () => {
		assert.equal(getContextUsageLevel(38, window), "warning");
		assert.equal(getContextUsageLevel(37, window), "normal");
	});

	it("trips purple at 68% via the token threshold (below the 70% percent gate)", () => {
		// 270k/400k*100 = 67.5%
		assert.equal(getContextUsageLevel(68, window), "purple");
		assert.equal(getContextUsageLevel(67, window), "warning");
	});
});

describe("getContextUsageLevel — unknown / invalid context", () => {
	it("treats null percent as normal", () => {
		assert.equal(getContextUsageLevel(null, 200_000), "normal");
	});

	it("treats non-finite percent as normal", () => {
		assert.equal(getContextUsageLevel(Number.NaN, 200_000), "normal");
	});

	it("treats zero/negative percent as normal (reachesThreshold guards <=0)", () => {
		assert.equal(getContextUsageLevel(0, 200_000), "normal");
		assert.equal(getContextUsageLevel(-5, 200_000), "normal");
	});

	it("falls back to the percent threshold when the window is unknown", () => {
		assert.equal(getContextUsageLevel(50, 0), "warning");
		assert.equal(getContextUsageLevel(90, 0), "error");
	});
});

describe("getContextUsageThemeColor — maps each level to a Pi ThemeColor", () => {
	it("maps normal -> dim, warning -> warning, purple -> thinkingHigh, error -> error", () => {
		assert.equal(getContextUsageThemeColor("normal"), "dim");
		assert.equal(getContextUsageThemeColor("warning"), "warning");
		assert.equal(getContextUsageThemeColor("purple"), "thinkingHigh");
		assert.equal(getContextUsageThemeColor("error"), "error");
	});
});
