import { type GeminiResponseDomSnapshot, waitForGeminiDomCompletion } from "#runtime/browser/gemini-web/streaming";

function sequence(values: readonly GeminiResponseDomSnapshot[]): () => Promise<GeminiResponseDomSnapshot> {
	let index = 0;
	return async () => values[Math.min(index++, values.length - 1)]!;
}

describe("Gemini DOM completion", () => {
	it("buffers rendered text and emits it once after completion", async () => {
		const deltas: string[] = [];
		const result = await waitForGeminiDomCompletion({
			read: sequence([
				{ currentText: "Hel", currentHtml: "Hel", running: true, responsePresent: true },
				{ currentText: "Hello\n", currentHtml: "Hello\n", running: true, responsePresent: true },
				{ currentText: "Hello\nW", currentHtml: "Hello\nW", running: true, responsePresent: true },
				{ currentText: "Hello\nWorld", currentHtml: "Hello\nWorld", running: false, responsePresent: true },
				{ currentText: "Hello\nWorld", currentHtml: "Hello\nWorld", running: false, responsePresent: true },
				{ currentText: "Hello\nWorld", currentHtml: "Hello\nWorld", running: false, responsePresent: true },
			]),
			emitTextDelta: (delta) => {
				deltas.push(delta);
			},
			pollMs: 1,
			stableMs: 3,
			timeoutMs: 100,
		});
		expect(result.text).toBe("Hello\nWorld");
		expect(deltas).toEqual(["Hello\nWorld"]);
	});

	it("accepts an in-progress DOM rewrite before final emission", async () => {
		const deltas: string[] = [];
		const result = await waitForGeminiDomCompletion({
			read: sequence([
				{ currentText: "Hello\nA", currentHtml: "Hello\nA", running: true, responsePresent: true },
				{ currentText: "Hello\nA", currentHtml: "Hello\nA", running: true, responsePresent: true },
				{ currentText: "Hullo\nA", currentHtml: "Hullo\nA", running: false, responsePresent: true },
			]),
			emitTextDelta: (delta) => {
				deltas.push(delta);
			},
			pollMs: 1,
			stableMs: 3,
			timeoutMs: 100,
		});
		expect(result.text).toBe("Hullo\nA");
		expect(deltas).toEqual(["Hullo\nA"]);
	});

	it("does not complete while the stop control is present", async () => {
		const result = await waitForGeminiDomCompletion({
			read: sequence([
				{ currentText: "Answer", currentHtml: "Answer", running: true, responsePresent: true },
				{ currentText: "Answer", currentHtml: "Answer", running: true, responsePresent: true },
				{ currentText: "Answer", currentHtml: "Answer", running: false, responsePresent: true },
				{ currentText: "Answer", currentHtml: "Answer", running: false, responsePresent: true },
				{ currentText: "Answer", currentHtml: "Answer", running: false, responsePresent: true },
			]),
			pollMs: 1,
			stableMs: 3,
			timeoutMs: 100,
		});
		expect(result.text).toBe("Answer");
	});
});
