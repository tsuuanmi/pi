import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getContextUsageLevel, getContextUsageThemeColor } from "#tui/index";

describe("getContextUsageLevel — percent thresholds", () => {
	it("normal below the warning threshold", () => {
		assert.equal(getContextUsageLevel(0, 200_000), "normal");
		assert.equal(getContextUsageLevel(49.9, 400_000), "normal");
	});

	it("warning at 50% boundary", () => {
		assert.equal(getContextUsageLevel(50, 200_000), "warning");
		assert.equal(getContextUsageLevel(69.9, 400_000), "warning");
	});

	it("purple at 75% boundary", () => {
		assert.equal(getContextUsageLevel(75, 200_000), "purple");
		assert.equal(getContextUsageLevel(74.9, 400_000), "warning");
	});

	it("error at 100% boundary", () => {
		assert.equal(getContextUsageLevel(100, 200_000), "error");
		assert.equal(getContextUsageLevel(99.9, 400_000), "purple");
	});
});

describe("getContextUsageLevel — window size is ignored", () => {
	it("uses the same percent thresholds for different context windows", () => {
		assert.equal(getContextUsageLevel(50, 0), "warning");
		assert.equal(getContextUsageLevel(50, 200_000), "warning");
		assert.equal(getContextUsageLevel(75, 0), "purple");
		assert.equal(getContextUsageLevel(75, 500_000), "purple");
		assert.equal(getContextUsageLevel(100, 0), "error");
		assert.equal(getContextUsageLevel(100, 1_000_000), "error");
	});
});

describe("getContextUsageLevel — unknown / invalid context", () => {
	it("treats null percent as normal", () => {
		assert.equal(getContextUsageLevel(null, 200_000), "normal");
	});

	it("treats non-finite percent as normal", () => {
		assert.equal(getContextUsageLevel(Number.NaN, 200_000), "normal");
	});

	it("treats zero/negative percent as normal", () => {
		assert.equal(getContextUsageLevel(0, 200_000), "normal");
		assert.equal(getContextUsageLevel(-5, 400_000), "normal");
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
