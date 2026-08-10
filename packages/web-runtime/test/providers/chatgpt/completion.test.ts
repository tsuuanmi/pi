import { describe, expect, test } from "vitest";
import { CompletionTracker, DomHealthTracker, isComplete } from "../../../src/providers/chatgpt/completion.ts";

const complete = {
	responsePresent: true,
	running: false,
	currentText: "done",
	currentHtml: "<p>done</p>",
	completionActionVisible: true,
};

describe("ChatGPT completion", () => {
	test("requires response text, stopped generation, and completion evidence", () => {
		expect(isComplete(complete)).toBe(true);
		expect(isComplete({ ...complete, responsePresent: false })).toBe(false);
		expect(isComplete({ ...complete, running: true })).toBe(false);
		expect(isComplete({ ...complete, currentText: "" })).toBe(false);
		expect(isComplete({ ...complete, completionActionVisible: false })).toBe(false);
	});

	test("requires stable text and HTML", () => {
		const tracker = new CompletionTracker(100);
		expect(tracker.update(complete, 0)).toBe(false);
		expect(tracker.update({ ...complete, currentHtml: "<p>done!</p>" }, 100)).toBe(false);
		expect(tracker.update({ ...complete, currentHtml: "<p>done!</p>" }, 199)).toBe(false);
		expect(tracker.update({ ...complete, currentHtml: "<p>done!</p>" }, 200)).toBe(true);
	});

	test("fails closed on missing or incomplete response DOM", () => {
		const missing = new DomHealthTracker(100, 100, 100);
		expect(
			missing.update({ responsePresent: false, running: true, currentText: "", completionActionVisible: false }, 0),
		).toBeUndefined();
		expect(
			missing.update(
				{ responsePresent: false, running: true, currentText: "", completionActionVisible: false },
				100,
			),
		).toMatch(/did not create/);

		const empty = new DomHealthTracker(100, 100, 100);
		const emptyState = { responsePresent: true, running: false, currentText: "", completionActionVisible: true };
		expect(empty.update(emptyState, 0)).toBeUndefined();
		expect(empty.update(emptyState, 100)).toMatch(/without a final answer/);

		const reasoning = new DomHealthTracker(100, 100, 100);
		const reasoningState = {
			responsePresent: true,
			running: false,
			currentText: "",
			completionActionVisible: false,
		};
		expect(reasoning.update(reasoningState, 0)).toBeUndefined();
		expect(reasoning.update(reasoningState, 1_000)).toBeUndefined();

		const action = new DomHealthTracker(100, 100, 100);
		const actionState = {
			responsePresent: true,
			running: false,
			currentText: "done",
			completionActionVisible: false,
		};
		expect(action.update(actionState, 0)).toBeUndefined();
		expect(action.update(actionState, 100)).toMatch(/without completed-turn evidence/);
	});
});
