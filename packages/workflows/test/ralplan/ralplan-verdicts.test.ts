import { isRalplanVerdict, parseRalplanVerdict } from "@tsuuanmi/pi-workflows";
import { describe, expect, it } from "vitest";

describe("ralplan verdict parser", () => {
	describe("critic", () => {
		it("parses APPROVE from a labeled verdict line", () => {
			expect(parseRalplanVerdict("critic", "## Verdict\nAPPROVE")).toEqual({ role: "critic", verdict: "approve" });
		});

		it("parses ITERATE", () => {
			expect(parseRalplanVerdict("critic", "Verdict: ITERATE")).toEqual({ role: "critic", verdict: "iterate" });
		});

		it("parses REJECT", () => {
			expect(parseRalplanVerdict("critic", "Verdict: REJECT")).toEqual({ role: "critic", verdict: "reject" });
		});

		it("parses a verdict in a multi-line labeled section", () => {
			const text = [
				"## Review",
				"Some prose about the plan.",
				"",
				"## Verdict",
				"ITERATE",
				"",
				"Next pass needed.",
			].join("\n");
			expect(parseRalplanVerdict("critic", text)).toEqual({ role: "critic", verdict: "iterate" });
		});

		it("falls back to full text when no verdict label is present", () => {
			expect(parseRalplanVerdict("critic", "I approve this plan.")).toEqual({ role: "critic", verdict: "approve" });
		});

		it("extracts a rationale when present", () => {
			const text = "Verdict: REJECT\nRationale: acceptance criteria are untestable.";
			expect(parseRalplanVerdict("critic", text)).toEqual({
				role: "critic",
				verdict: "reject",
				rationale: "acceptance criteria are untestable.",
			});
		});

		it("returns undefined when no verdict token is present", () => {
			expect(parseRalplanVerdict("critic", "# Critic review with no verdict token")).toBeUndefined();
		});

		it("does not match 'approved' or 'approval' as APPROVE (word boundary)", () => {
			expect(parseRalplanVerdict("critic", "The plan was approved and approval is pending.")).toBeUndefined();
		});

		it("does not match 'rejected' as REJECT (word boundary)", () => {
			expect(parseRalplanVerdict("critic", "I rejected the earlier draft.")).toBeUndefined();
		});
	});

	describe("architect", () => {
		it("parses CLEAR + APPROVE", () => {
			expect(parseRalplanVerdict("architect", "Clarity: CLEAR\nRecommendation: APPROVE")).toEqual({
				role: "architect",
				clarity: "clear",
				recommendation: "approve",
			});
		});

		it("parses WATCH + REQUEST CHANGES (phrase form)", () => {
			expect(parseRalplanVerdict("architect", "Clarity: WATCH\nRecommendation: REQUEST CHANGES")).toEqual({
				role: "architect",
				clarity: "watch",
				recommendation: "request_changes",
			});
		});

		it("parses BLOCK + COMMENT", () => {
			expect(parseRalplanVerdict("architect", "Verdict: BLOCK, COMMENT")).toEqual({
				role: "architect",
				clarity: "block",
				recommendation: "comment",
			});
		});

		it("accepts request_changes / request-changes spellings", () => {
			expect(parseRalplanVerdict("architect", "Clarity: BLOCK\nRecommendation: request_changes")).toEqual({
				role: "architect",
				clarity: "block",
				recommendation: "request_changes",
			});
			expect(parseRalplanVerdict("architect", "Clarity: BLOCK\nRecommendation: request-changes")).toEqual({
				role: "architect",
				clarity: "block",
				recommendation: "request_changes",
			});
		});

		it("extracts a rationale", () => {
			const text = "Clarity: WATCH\nRecommendation: COMMENT\nRationale: ownership boundary is unclear.";
			expect(parseRalplanVerdict("architect", text)).toEqual({
				role: "architect",
				clarity: "watch",
				recommendation: "comment",
				rationale: "ownership boundary is unclear.",
			});
		});

		it("returns undefined when recommendation is missing", () => {
			expect(parseRalplanVerdict("architect", "Clarity: BLOCK\nNo recommendation given.")).toBeUndefined();
		});

		it("returns undefined when clarity is missing", () => {
			expect(parseRalplanVerdict("architect", "Recommendation: APPROVE\nNo clarity line.")).toBeUndefined();
		});

		it("returns undefined when no verdict-context line exists (precision: avoid prose false positives)", () => {
			// "clear" and "block" appear in prose but no verdict/recommendation label.
			expect(
				parseRalplanVerdict("architect", "The plan is clear and we should block this section from changes."),
			).toBeUndefined();
		});

		it("does not match 'blocked'/'blocking' as BLOCK (word boundary)", () => {
			expect(parseRalplanVerdict("architect", "Verdict: the path is blocked, recommend APPROVE")).toBeUndefined();
		});
	});

	describe("fail-open", () => {
		it("returns undefined for empty input", () => {
			expect(parseRalplanVerdict("critic", "")).toBeUndefined();
		});

		it("returns undefined for non-string input", () => {
			expect(parseRalplanVerdict("critic", undefined as unknown as string)).toBeUndefined();
		});
	});

	describe("isRalplanVerdict", () => {
		it("accepts a well-formed critic verdict", () => {
			expect(isRalplanVerdict({ role: "critic", verdict: "approve" })).toBe(true);
		});

		it("accepts a well-formed architect verdict", () => {
			expect(isRalplanVerdict({ role: "architect", clarity: "block", recommendation: "request_changes" })).toBe(
				true,
			);
		});

		it("rejects an unknown role", () => {
			expect(isRalplanVerdict({ role: "planner", verdict: "approve" })).toBe(false);
		});

		it("rejects a malformed critic verdict", () => {
			expect(isRalplanVerdict({ role: "critic", verdict: "maybe" })).toBe(false);
		});

		it("rejects non-objects", () => {
			expect(isRalplanVerdict(null)).toBe(false);
			expect(isRalplanVerdict("critic")).toBe(false);
			expect(isRalplanVerdict(undefined)).toBe(false);
		});

		it("rejects a rationale of the wrong type", () => {
			expect(isRalplanVerdict({ role: "critic", verdict: "approve", rationale: 42 })).toBe(false);
		});
	});
});
