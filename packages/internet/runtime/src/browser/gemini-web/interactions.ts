import type { Locator, Page } from "playwright-core";
import { assertGeminiPageAuthenticated } from "#runtime/browser/gemini-web/auth";
import {
	GEMINI_COMPOSER_SELECTOR,
	GEMINI_HOME_URL,
	GEMINI_MODEL_MENU_BUTTON_SELECTOR,
	GEMINI_MODEL_MENU_ITEM_SELECTOR,
	GEMINI_SEND_BUTTON_SELECTOR,
	GEMINI_STOP_BUTTON_SELECTOR,
	parseGeminiConversationUrl,
} from "#runtime/browser/gemini-web/session";

export async function activeGeminiComposer(page: Page, timeoutMs = 30_000): Promise<Locator> {
	const composers = page.locator(GEMINI_COMPOSER_SELECTOR).filter({ visible: true });
	const deadline = Date.now() + timeoutMs;
	let count = 0;
	while (Date.now() < deadline) {
		count = await composers.count();
		if (count === 1) return composers.first();
		await new Promise(resolveSleep => setTimeout(resolveSleep, 50));
	}
	throw new Error(`Gemini did not expose exactly one visible composer (visibleComposers=${count})`);
}

export async function prepareGeminiConversationSurface(
	page: Page,
	conversationUrl?: string,
	): Promise<Locator> {
	if (conversationUrl !== undefined) {
		const parsedUrl = parseGeminiConversationUrl(conversationUrl);
		if (!parsedUrl) throw new Error("Gemini conversation URL is invalid");
		if (page.url() !== parsedUrl) {
			await page.goto(parsedUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
		}
	} else if (page.url() !== GEMINI_HOME_URL) {
		await page.goto(GEMINI_HOME_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
	}
	await assertGeminiPageAuthenticated(page);
	return activeGeminiComposer(page);
}

export async function fillGeminiComposer(page: Page, text: string): Promise<void> {
	const composer = await activeGeminiComposer(page);
	await composer.fill(text);
}

export async function sendGeminiMessage(page: Page, timeoutMs = 20_000): Promise<void> {
	const send = page.locator(GEMINI_SEND_BUTTON_SELECTOR).filter({ visible: true }).last();
	await send.waitFor({ state: "visible", timeout: timeoutMs });
	if (!await send.isEnabled()) throw new Error("Gemini send button is disabled");
	await send.click();
}

export async function stopGeminiResponse(page: Page, timeoutMs = 10_000): Promise<void> {
	const stop = page.locator(GEMINI_STOP_BUTTON_SELECTOR).filter({ visible: true }).last();
	await stop.waitFor({ state: "visible", timeout: timeoutMs });
	await stop.click();
}

export async function selectGeminiModel(page: Page, label: string, timeoutMs = 10_000): Promise<void> {
	const menuButton = page.locator(GEMINI_MODEL_MENU_BUTTON_SELECTOR).last();
	await menuButton.waitFor({ state: "visible", timeout: timeoutMs });
	await menuButton.click();
	const items = page.locator(GEMINI_MODEL_MENU_ITEM_SELECTOR).filter({ visible: true });
	try {
		await items.first().waitFor({ state: "visible", timeout: timeoutMs });
		const matching = items.filter({ hasText: label });
		if (await matching.count() !== 1) throw new Error("Gemini model menu did not expose the requested label");
		await matching.first().click();
	} finally {
		await page.keyboard.press("Escape").catch(() => {});
	}
}
