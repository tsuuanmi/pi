import type { Page } from "playwright";
import type { ChatGptRoute } from "./routes.ts";
import { COMPOSER_SELECTOR, EFFORT_CONTROL_SELECTOR, EFFORT_ITEM_SELECTOR, EFFORT_MENU_SELECTOR } from "./selectors.ts";

export async function selectRoute(page: Page, route: ChatGptRoute, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) throw signal.reason;
	const form = page.locator(COMPOSER_SELECTOR).locator("xpath=ancestor::form[1]");
	const control = form.locator(EFFORT_CONTROL_SELECTOR);
	await control.waitFor({ state: "visible", timeout: 30_000 });
	if (signal?.aborted) throw signal.reason;
	if ((await control.getAttribute("aria-expanded")) !== "true") await control.click();
	const item = page.locator(EFFORT_MENU_SELECTOR).locator(EFFORT_ITEM_SELECTOR).nth(route.effortIndex);
	await item.waitFor({ state: "visible", timeout: 30_000 });
	if (signal?.aborted) throw signal.reason;
	await item.click();
	if (signal?.aborted) throw signal.reason;
}
