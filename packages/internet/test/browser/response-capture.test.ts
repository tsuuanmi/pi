import type { Page, Response } from "playwright-core";
import { BrowserResponseCapture } from "#runtime/browser/response-capture";

class ResponsePage {
	private readonly listeners = new Set<(response: Response) => void>();

	on(event: "response", listener: (response: Response) => void): void {
		if (event === "response") this.listeners.add(listener);
	}

	off(event: "response", listener: (response: Response) => void): void {
		if (event === "response") this.listeners.delete(listener);
	}

	emit(response: Response): void {
		for (const listener of this.listeners) listener(response);
	}
}

const response = {} as Response;

function capture<T>(page: ResponsePage, parse: () => Promise<T | undefined>): BrowserResponseCapture<T> {
	return new BrowserResponseCapture(page as unknown as Page, {
		matches: () => true,
		parse,
	});
}

describe("BrowserResponseCapture", () => {
	it("waits for a matching response that arrives after waiting begins", async () => {
		const page = new ResponsePage();
		const responseCapture = capture(page, async () => "captured");
		const waiting = responseCapture.waitForValue({ timeoutMs: 100 });
		page.emit(response);
		await expect(waiting).resolves.toBe("captured");
		responseCapture.dispose();
	});

	it("reports parser failures when no response value is available", async () => {
		const page = new ResponsePage();
		const failure = new Error("invalid response");
		const responseCapture = capture(page, async () => {
			throw failure;
		});
		const waiting = responseCapture.waitForValue({ timeoutMs: 10 });
		page.emit(response);
		await expect(waiting).rejects.toMatchObject({ errors: [failure] });
		responseCapture.dispose();
	});

	it("stops waiting when aborted", async () => {
		const page = new ResponsePage();
		const responseCapture = capture(page, async () => undefined);
		const controller = new AbortController();
		const waiting = responseCapture.waitForValue({ timeoutMs: 1_000, signal: controller.signal });
		controller.abort(new Error("cancelled"));
		await expect(waiting).rejects.toThrow("cancelled");
		responseCapture.dispose();
	});
});
