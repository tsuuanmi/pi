import type { WebTurn, WebTurnEvent } from "../../types.ts";
import { uploadAttachments, validateAttachments } from "./attachments.ts";
import { activeComposer, setPrompt } from "./composer.ts";
import { selectEffort } from "./effort.ts";
import { checkPage } from "./errors.ts";
import { assertTemporaryChat } from "./login.ts";
import { getChatGptRoute } from "./routes.ts";
import { TEMP_CHAT_URL } from "./selectors.ts";
import { streamResponse } from "./stream.ts";
import { submit } from "./submit.ts";
import { abortable, throwIfAborted } from "./wait.ts";

export async function runChatGptTurn(turn: WebTurn, emit: (event: WebTurnEvent) => Promise<unknown>): Promise<void> {
	const route = getChatGptRoute(turn.model);
	validateAttachments(route, turn.attachments);
	throwIfAborted(turn.signal);
	await abortable(turn.page.goto(TEMP_CHAT_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }), turn.signal);
	await activeComposer(turn.page, turn.signal);
	assertTemporaryChat(turn.page);
	await checkPage(turn.page);
	await selectEffort(turn.page, route, turn.signal);
	await setPrompt(turn.page, turn.prompt, turn.signal);
	await uploadAttachments(turn.page, route, turn.attachments, turn.signal);
	const response = await submit(turn.page, turn.signal);
	await streamResponse(turn.page, response, turn.signal, emit);
	throwIfAborted(turn.signal);
	await emit({ type: "done" });
}
