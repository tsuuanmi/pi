import type { Page } from "playwright";
import { BrowserSession } from "../../session.ts";
import type { WebProviderEntitlement } from "../../types.ts";
import { checkPage } from "./errors.ts";
import { CHATGPT_ROUTES } from "./routes.ts";
import {
	COMPOSER_SELECTOR,
	EFFORT_CONTROL_SELECTOR,
	EFFORT_ITEM_SELECTOR,
	EFFORT_MENU_SELECTOR,
	TEMPORARY_CHAT_URL,
} from "./selectors.ts";

export async function verifyChatGptLogin(profileDir: string, signal: AbortSignal): Promise<WebProviderEntitlement> {
	if (signal.aborted) throw signal.reason;
	const session = await BrowserSession.open(profileDir);
	try {
		const page = await session.openTurn("verify");
		await page.goto(TEMPORARY_CHAT_URL, { waitUntil: "domcontentloaded" });
		if (signal.aborted) throw signal.reason;
		await checkPage(page);
		await page.locator(COMPOSER_SELECTOR).waitFor({ state: "visible", timeout: 600_000 });
		if (signal.aborted) throw signal.reason;
		assertTemporaryChat(page);
		return { routes: await detectChatGptRoutes(page, signal) };
	} finally {
		await session.close();
	}
}

export function assertTemporaryChat(page: Page): void {
	const url = new URL(page.url());
	if (
		url.origin !== "https://chatgpt.com" ||
		url.pathname !== "/" ||
		url.searchParams.get("temporary-chat") !== "true"
	) {
		throw new Error(`ChatGPT left the Temporary Chat surface: ${page.url()}`);
	}
}

async function detectChatGptRoutes(page: Page, signal: AbortSignal): Promise<readonly string[]> {
	if (signal.aborted) throw signal.reason;
	const form = page.locator(COMPOSER_SELECTOR).locator("xpath=ancestor::form[1]");
	const control = form.locator(EFFORT_CONTROL_SELECTOR);
	await control.waitFor({ state: "visible", timeout: 30_000 });
	if (signal.aborted) throw signal.reason;
	if ((await control.getAttribute("aria-expanded")) !== "true") await control.click();
	const items = page.locator(EFFORT_MENU_SELECTOR).locator(EFFORT_ITEM_SELECTOR);
	await items.first().waitFor({ state: "visible", timeout: 30_000 });
	if (signal.aborted) throw signal.reason;
	const count = await items.count();
	await page.keyboard.press("Escape");
	if (signal.aborted) throw signal.reason;
	if (count < 1 || count > CHATGPT_ROUTES.length) throw new Error("ChatGPT returned an unsupported entitlement set");
	return CHATGPT_ROUTES.slice(0, count).map((route) => route.id);
}
