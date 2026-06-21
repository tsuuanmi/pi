import { describe, expect, it } from "vitest";
import {
	getContextUsageLevel,
	getContextUsageThemeColor,
} from "../src/modes/interactive/components/status-line/context-thresholds.ts";

// Thresholds (context-thresholds.ts): warning 50% / 150k, purple 70% / 270k,
// error 90% / 500k. A level trips at min(percentThreshold, tokenPercentThreshold)
// where tokenPercentThreshold = tokenThreshold / contextWindow * 100.

describe("getContextUsageLevel — 200k window (percent thresholds win)", () => {
	const window = 200_000;

	it("normal below the warning threshold", () => {
		expect(getContextUsageLevel(0, window)).toBe("normal");
		expect(getContextUsageLevel(49.9, window)).toBe("normal");
	});

	it("warning at 50% boundary", () => {
		expect(getContextUsageLevel(50, window)).toBe("warning");
		expect(getContextUsageLevel(69.9, window)).toBe("warning");
	});

	it("purple at 70% boundary", () => {
		expect(getContextUsageLevel(70, window)).toBe("purple");
		expect(getContextUsageLevel(89.9, window)).toBe("purple");
	});

	it("error at 90% boundary", () => {
		expect(getContextUsageLevel(90, window)).toBe("error");
		expect(getContextUsageLevel(100, window)).toBe("error");
	});
});

describe("getContextUsageLevel — large window trips via absolute tokens first", () => {
	// 400k window: warning token pct = 150k/400k*100 = 37.5% < 50%, so the token
	// threshold wins and warning trips at 37.5%.
	const window = 400_000;

	it("trips warning at 38% via the token threshold (below the 50% percent gate)", () => {
		expect(getContextUsageLevel(38, window)).toBe("warning");
		expect(getContextUsageLevel(37, window)).toBe("normal");
	});

	it("trips purple at 68% via the token threshold (below the 70% percent gate)", () => {
		// 270k/400k*100 = 67.5%
		expect(getContextUsageLevel(68, window)).toBe("purple");
		expect(getContextUsageLevel(67, window)).toBe("warning");
	});
});

describe("getContextUsageLevel — unknown / invalid context", () => {
	it("treats null percent as normal", () => {
		expect(getContextUsageLevel(null, 200_000)).toBe("normal");
	});

	it("treats non-finite percent as normal", () => {
		expect(getContextUsageLevel(Number.NaN, 200_000)).toBe("normal");
	});

	it("treats zero/negative percent as normal (reachesThreshold guards <=0)", () => {
		expect(getContextUsageLevel(0, 200_000)).toBe("normal");
		expect(getContextUsageLevel(-5, 200_000)).toBe("normal");
	});

	it("falls back to the percent threshold when the window is unknown", () => {
		expect(getContextUsageLevel(50, 0)).toBe("warning");
		expect(getContextUsageLevel(90, 0)).toBe("error");
	});
});

describe("getContextUsageThemeColor — maps each level to a Pi ThemeColor", () => {
	it("maps normal -> dim, warning -> warning, purple -> thinkingHigh, error -> error", () => {
		expect(getContextUsageThemeColor("normal")).toBe("dim");
		expect(getContextUsageThemeColor("warning")).toBe("warning");
		expect(getContextUsageThemeColor("purple")).toBe("thinkingHigh");
		expect(getContextUsageThemeColor("error")).toBe("error");
	});
});
