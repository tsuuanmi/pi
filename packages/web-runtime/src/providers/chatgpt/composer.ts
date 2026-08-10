/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { Locator, Page } from "playwright";
import { COMPOSER } from "./selectors.ts";
import { throwIfAborted, wait } from "./wait.ts";

const INSERT_CHARS = 200_000;

export async function activeComposer(page: Page, signal: AbortSignal, timeoutMs = 30_000): Promise<Locator> {
	const composers = page.locator(COMPOSER).filter({ visible: true });
	const deadline = Date.now() + timeoutMs;
	let count = 0;
	while (Date.now() < deadline) {
		throwIfAborted(signal);
		count = await composers.count();
		if (count === 1) return composers.first();
		await wait(50, signal);
	}
	throw new Error(`ChatGPT did not expose exactly one visible composer (visibleComposers=${count})`);
}

export async function setPrompt(page: Page, prompt: string, signal: AbortSignal): Promise<void> {
	if (prompt.length === 0) throw new Error("ChatGPT prompt must not be empty");
	const composer = await activeComposer(page, signal);
	await composer.fill("");
	await composer.focus();
	for (let offset = 0; offset < prompt.length; offset += INSERT_CHARS) {
		throwIfAborted(signal);
		await page.keyboard.insertText(prompt.slice(offset, offset + INSERT_CHARS));
	}

	const deadline = Date.now() + 10_000;
	let actual = "";
	while (Date.now() < deadline) {
		throwIfAborted(signal);
		actual = await promptText(page, signal);
		if (actual === prompt) return;
		await wait(50, signal);
	}

	let prefix = 0;
	while (prefix < prompt.length && prompt[prefix] === actual[prefix]) prefix += 1;
	throw new Error(
		`ChatGPT composer did not preserve the complete prompt (expectedChars=${prompt.length}, actualChars=${actual.length}, commonPrefixChars=${prefix})`,
	);
}

async function promptText(page: Page, signal: AbortSignal): Promise<string> {
	const composer = await activeComposer(page, signal);
	return composer.evaluate((element) => {
		const clone = element.cloneNode(true) as HTMLElement;
		clone.querySelectorAll("[data-inline-selection-pill-cursor-target]").forEach((part) => {
			part.remove();
		});
		return [...clone.childNodes]
			.map((child) => child.textContent ?? "")
			.join("\n")
			.trimStart();
	});
}
