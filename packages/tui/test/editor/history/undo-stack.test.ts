import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UndoStack } from "#tui/editor/history/undo-stack";

describe("UndoStack", () => {
	it("starts empty", () => {
		const stack = new UndoStack<number>();
		assert.equal(stack.length, 0);
		assert.equal(stack.pop(), undefined);
	});

	it("pushes a deep clone so later mutation does not affect the snapshot", () => {
		const stack = new UndoStack<{ items: number[] }>();
		const state = { items: [1, 2, 3] };
		stack.push(state);
		state.items.push(4);
		const popped = stack.pop();
		assert.deepEqual(popped?.items, [1, 2, 3]);
		assert.notEqual(popped, state);
	});

	it("pops in LIFO order", () => {
		const stack = new UndoStack<string>();
		stack.push("a");
		stack.push("b");
		assert.equal(stack.length, 2);
		assert.equal(stack.pop(), "b");
		assert.equal(stack.pop(), "a");
		assert.equal(stack.length, 0);
	});

	it("clear removes all snapshots", () => {
		const stack = new UndoStack<number>();
		stack.push(1);
		stack.push(2);
		stack.clear();
		assert.equal(stack.length, 0);
		assert.equal(stack.pop(), undefined);
	});

	it("returns snapshots directly without re-cloning", () => {
		const stack = new UndoStack<{ n: number }>();
		stack.push({ n: 1 });
		const popped = stack.pop();
		assert.equal(popped?.n, 1);
		// Mutating the popped snapshot does not throw; it is detached.
		if (popped) popped.n = 99;
		assert.equal(stack.length, 0);
	});
});
