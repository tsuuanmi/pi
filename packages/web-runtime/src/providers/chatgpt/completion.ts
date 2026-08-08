import type { Page } from "playwright";
import { checkPage } from "./errors.ts";
import { assertTemporaryChat } from "./login.ts";
import { ASSISTANT_TURN_SELECTOR, COMPLETION_SELECTOR } from "./selectors.ts";

const TURN_TIMEOUT_MS = 300_000;
const SETTLE_MS = 2_000;
const POLL_MS = 100;

export async function waitForCompletion(
	page: Page,
	signal: AbortSignal,
	onText?: (delta: string) => Promise<void>,
): Promise<void> {
	if (signal.aborted) throw signal.reason;
	const deadline = Date.now() + TURN_TIMEOUT_MS;
	const assistant = page.locator(ASSISTANT_TURN_SELECTOR).last();
	const completion = page.locator(COMPLETION_SELECTOR).last();
	await assistant.waitFor({ state: "visible", timeout: TURN_TIMEOUT_MS });
	await checkPage(page);
	let candidate = "";
	let stableSince = 0;
	let lastErrorCheck = 0;
	while (Date.now() < deadline) {
		if (signal.aborted) throw signal.reason;
		if (Date.now() - lastErrorCheck >= 500) {
			await checkPage(page);
			lastErrorCheck = Date.now();
		}
		if (await completion.isVisible()) {
			const text = await assistant.innerText({ timeout: 30_000 });
			if (text) {
				if (candidate && !text.startsWith(candidate)) {
					throw new Error("ChatGPT rewrote assistant output before completion");
				}
				if (text !== candidate) {
					const delta = text.slice(candidate.length);
					candidate = text;
					stableSince = Date.now();
					if (delta && onText) await onText(delta);
				} else if (Date.now() - stableSince >= SETTLE_MS) {
					return;
				}
			}
		}
		await delay(Math.min(POLL_MS, Math.max(1, deadline - Date.now())));
	}
	throw new Error("ChatGPT response did not settle before timeout");
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function readAssistantText(page: Page, signal?: AbortSignal): Promise<string> {
	if (signal?.aborted) throw signal.reason;
	assertTemporaryChat(page);
	const text = await page.locator(ASSISTANT_TURN_SELECTOR).last().innerText({ timeout: 30_000 });
	if (signal?.aborted) throw signal.reason;
	if (!text) throw new Error("ChatGPT completed without output");
	return text;
}
