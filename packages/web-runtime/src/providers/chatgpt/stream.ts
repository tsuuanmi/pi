import type { Locator, Page } from "playwright";
import type { WebTurnEvent } from "../../types.ts";
import { CompletionTracker, DomHealthTracker } from "./completion.ts";
import { checkPage, checkTurn } from "./errors.ts";
import { MarkdownBuffer } from "./markdown.ts";
import { responseSnapshot } from "./response.ts";
import { STOP_BUTTON } from "./selectors.ts";
import { TraceTracker } from "./trace.ts";
import { throwIfAborted, wait } from "./wait.ts";

export async function streamResponse(
	page: Page,
	response: Locator,
	signal: AbortSignal,
	emit: (event: WebTurnEvent) => Promise<unknown>,
): Promise<void> {
	const markdown = new MarkdownBuffer();
	const trace = new TraceTracker();
	const completion = new CompletionTracker();
	const health = new DomHealthTracker();
	let reasoningStarted = false;

	for (;;) {
		if (page.isClosed()) throw new Error("ChatGPT browser tab was closed while the turn was active");
		if (signal.aborted) {
			const stop = page.locator(STOP_BUTTON).last();
			if (await stop.isVisible()) await stop.press("Enter");
			throwIfAborted(signal);
		}

		await checkPage(page);
		await checkTurn(response);
		const snapshot = await responseSnapshot(response);
		const running = await page.locator(STOP_BUTTON).last().isVisible();
		const state = {
			responsePresent: snapshot.responsePresent,
			running,
			currentText: snapshot.visibleText,
			completionActionVisible: snapshot.completionActionVisible,
		};
		const error = health.update(state);
		if (error) throw new Error(error);

		if (snapshot.responsePresent) {
			for (const event of trace.observe(snapshot.traceBlocks, snapshot.completionActionVisible)) {
				const separator = event.continuation || !reasoningStarted ? "" : "\n\n";
				await emit({ type: "reasoning", text: `${separator}${event.text}` });
				reasoningStarted = true;
			}
			const delta = markdown.observe(snapshot.markdownSegments);
			if (delta) await emit({ type: "text", text: delta });

			if (completion.update({ ...state, currentHtml: snapshot.fullHtml })) {
				const final = markdown.finish();
				if (!final.markdown && snapshot.visibleText) {
					throw new Error("ChatGPT completed with visible text that could not be serialized as Markdown");
				}
				if (final.delta) await emit({ type: "text", text: final.delta });
				return;
			}
		}
		await wait(250, signal);
	}
}
