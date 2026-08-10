import type { Locator, Page } from "playwright";
import { activeComposer } from "./composer.ts";
import { checkPage, checkTurn } from "./errors.ts";
import { ASSISTANT_TURN, SEND_BUTTON, STOP_BUTTON, USER_TURN } from "./selectors.ts";
import { throwIfAborted, wait } from "./wait.ts";

export type SubmissionEvidence = "user-turn" | "assistant-turn" | "generation-running";

export function submissionEvidence(state: {
	initialUserTurns: number;
	userTurns: number;
	initialAssistantTurns: number;
	assistantTurns: number;
	running: boolean;
}): SubmissionEvidence | undefined {
	if (state.userTurns > state.initialUserTurns) return "user-turn";
	if (state.assistantTurns > state.initialAssistantTurns) return "assistant-turn";
	if (state.running) return "generation-running";
	return undefined;
}

export async function submit(page: Page, signal: AbortSignal): Promise<Locator> {
	const assistantTurns = page.locator(ASSISTANT_TURN);
	const initialAssistantTurns = await assistantTurns.count();
	const response = assistantTurns.nth(initialAssistantTurns);
	const userTurns = page.locator(USER_TURN);
	const initialUserTurns = await userTurns.count();

	const composer = await activeComposer(page, signal);
	const send = composer.locator("xpath=ancestor::form[1]").locator(SEND_BUTTON);
	const readyDeadline = Date.now() + 30_000;
	let ready = false;
	while (Date.now() < readyDeadline) {
		throwIfAborted(signal);
		await checkPage(page);
		ready = (await send.isVisible()) && (await send.isEnabled());
		if (ready) break;
		await wait(100, signal);
	}
	if (!ready) throw new Error("ChatGPT send button did not become ready after the complete prompt was attached");
	await wait(250, signal);
	await checkPage(page);
	await send.press("Enter");

	const deadline = Date.now() + 60_000;
	const stop = page.locator(STOP_BUTTON).filter({ visible: true });
	while (Date.now() < deadline) {
		throwIfAborted(signal);
		await checkPage(page);
		await checkTurn(response);
		const evidence = submissionEvidence({
			initialUserTurns,
			userTurns: await userTurns.count(),
			initialAssistantTurns,
			assistantTurns: await assistantTurns.count(),
			running: (await stop.count()) > 0,
		});
		if (evidence) return response;
		await wait(50, signal);
	}
	throw new Error("ChatGPT did not accept the submitted message");
}
