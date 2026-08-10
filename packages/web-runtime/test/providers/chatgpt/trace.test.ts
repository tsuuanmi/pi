import { describe, expect, test } from "vitest";
import { isTraceControl, TraceTracker } from "../../../src/providers/chatgpt/trace.ts";

describe("ChatGPT visible trace", () => {
	test("emits only stable reasoning and append-only continuations", () => {
		const tracker = new TraceTracker(100);
		const first = [{ kind: "status" as const, key: "step", text: "Reading files" }];
		expect(tracker.observe(first, false, 0)).toEqual([]);
		expect(tracker.observe(first, false, 99)).toEqual([]);
		expect(tracker.observe(first, false, 100)).toEqual([{ kind: "reasoning", text: "Reading files" }]);
		expect(tracker.observe([{ ...first[0], text: "Reading files now" }], true, 101)).toEqual([
			{ kind: "reasoning", text: " now", continuation: true },
		]);
	});

	test("holds mutable commentary until a stable boundary", () => {
		const tracker = new TraceTracker(0);
		const block = { kind: "commentary" as const, key: "note", text: "Checking", complete: false };
		expect(tracker.observe([block], false, 0)).toEqual([]);
		expect(tracker.observe([block], true, 1)).toEqual([{ kind: "commentary", text: "Checking" }]);
	});

	test("filters ChatGPT controls", () => {
		expect(isTraceControl({ kind: "status", text: "Thinking" })).toBe(true);
		expect(isTraceControl({ kind: "status", text: "Stop", uiControl: true })).toBe(true);
		expect(isTraceControl({ kind: "status", text: "Searching" })).toBe(false);
	});
});
