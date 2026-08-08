import type { Page } from "playwright";
import type { WebTurn, WebTurnEvent } from "../../types.ts";
import { uploadAttachments, validateAttachments } from "./attachments.ts";
import { readAssistantText, waitForCompletion } from "./completion.ts";
import { checkPage } from "./errors.ts";
import { assertTemporaryChat } from "./login.ts";
import { getChatGptRoute } from "./routes.ts";
import { selectRoute } from "./select.ts";
import { COMPOSER_SELECTOR, SEND_BUTTON_SELECTOR, TEMPORARY_CHAT_URL } from "./selectors.ts";

export async function runChatGptTurn(turn: WebTurn, emit: (event: WebTurnEvent) => Promise<void>): Promise<void> {
	const route = getChatGptRoute(turn.model);
	if (turn.signal.aborted) throw turn.signal.reason;
	const page: Page = turn.page;
	validateAttachments(route, turn.attachments);
	await page.goto(TEMPORARY_CHAT_URL, { waitUntil: "domcontentloaded" });
	assertTemporaryChat(page);
	await checkPage(page);
	await selectRoute(page, route, turn.signal);
	await uploadAttachments(page, route, turn.attachments, turn.signal);
	if (turn.signal.aborted) throw turn.signal.reason;
	await page.locator(COMPOSER_SELECTOR).fill(turn.prompt);
	await page.locator(SEND_BUTTON_SELECTOR).click();
	let emitted = "";
	await waitForCompletion(page, turn.signal, async (delta) => {
		emitted += delta;
		await emit({ type: "text", text: delta });
	});
	const text = await readAssistantText(page, turn.signal);
	if (text.length < emitted.length || !text.startsWith(emitted)) {
		throw new Error("ChatGPT final output did not match streamed output");
	}
	if (turn.signal.aborted) throw turn.signal.reason;
	if (text.length > emitted.length) await emit({ type: "text", text: text.slice(emitted.length) });
	if (turn.signal.aborted) throw turn.signal.reason;
	await emit({ type: "done" });
}
