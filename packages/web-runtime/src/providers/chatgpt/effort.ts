import type { Locator, Page } from "playwright";
import { activeComposer } from "./composer.ts";
import { checkPage } from "./errors.ts";
import type { ChatGptRoute } from "./routes.ts";
import { CHATGPT_ROUTES } from "./routes.ts";
import { EFFORT_BUTTON, EFFORT_MENU, EFFORT_OPTION } from "./selectors.ts";
import { throwIfAborted, wait } from "./wait.ts";

const READY_MS = 70_000;
const CONFIRM_MS = 40_000;

export async function selectEffort(page: Page, route: ChatGptRoute, signal: AbortSignal): Promise<void> {
	const { button, menu, options } = await openMenu(page, signal);
	const count = await options.count();
	if (count !== 3 && count !== CHATGPT_ROUTES.length) {
		throw new Error(`ChatGPT exposed an unsupported effort menu shape (itemCount=${count})`);
	}
	if (route.effortIndex >= count) {
		throw new Error(`ChatGPT effort menu does not contain item index ${route.effortIndex} (itemCount=${count})`);
	}
	const option = options.nth(route.effortIndex);
	await option.waitFor({ state: "visible", timeout: READY_MS, signal });
	if (!(await checked(option, route.effortIndex))) {
		await option.click();
		const deadline = Date.now() + CONFIRM_MS;
		let confirmed: string | null = null;
		while (Date.now() < deadline) {
			throwIfAborted(signal);
			if (!(await menu.isVisible())) {
				if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
				await option.waitFor({
					state: "visible",
					timeout: Math.max(1, Math.min(5_000, deadline - Date.now())),
					signal,
				});
			}
			confirmed = await option.getAttribute("aria-checked");
			if (confirmed === "true") break;
			if (confirmed !== "false") {
				throw new Error(`ChatGPT effort item index ${route.effortIndex} lost its semantic checked state`);
			}
			await wait(100, signal);
		}
		if (confirmed !== "true") {
			throw new Error(
				`ChatGPT did not confirm effort item index ${route.effortIndex} (aria-checked=${JSON.stringify(confirmed)})`,
			);
		}
	}
	if ((await menu.isVisible()) || (await button.getAttribute("aria-expanded")) === "true") {
		await page.keyboard.press("Escape");
	}
}

export async function availableRoutes(page: Page, signal: AbortSignal): Promise<readonly string[]> {
	const { menu, options } = await openMenu(page, signal);
	const count = await options.count();
	if (count !== 3 && count !== CHATGPT_ROUTES.length) {
		throw new Error(`ChatGPT exposed an unsupported effort menu shape (itemCount=${count})`);
	}
	for (let index = 0; index < count; index += 1) {
		const option = options.nth(index);
		await option.waitFor({ state: "visible", timeout: 5_000, signal });
		await checked(option, index);
	}
	await page.keyboard.press("Escape");
	await menu.waitFor({ state: "hidden", timeout: 5_000, signal });
	return CHATGPT_ROUTES.slice(0, count).map((route) => route.id);
}

async function openMenu(
	page: Page,
	signal: AbortSignal,
): Promise<{ button: Locator; menu: Locator; options: Locator }> {
	const composer = await activeComposer(page, signal);
	const form = composer.locator("xpath=ancestor::form[1]");
	const button = form.locator(EFFORT_BUTTON);
	await button.waitFor({ state: "visible", timeout: READY_MS, signal });
	await wait(250, signal);
	await checkPage(page);
	if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
	const menus = page.locator(EFFORT_MENU).filter({ visible: true });
	await menus.first().waitFor({ state: "visible", timeout: READY_MS, signal });
	const menuCount = await menus.count();
	if (menuCount !== 1) throw new Error(`ChatGPT did not expose exactly one visible effort menu (count=${menuCount})`);
	const menu = menus.first();
	const options = menu.locator(EFFORT_OPTION);
	await options.first().waitFor({ state: "visible", timeout: READY_MS, signal });
	await checkPage(page);
	return { button, menu, options };
}

async function checked(option: Locator, index: number): Promise<boolean> {
	const value = await option.getAttribute("aria-checked");
	if (value !== "true" && value !== "false") {
		throw new Error(`ChatGPT effort item index ${index} has no semantic checked state`);
	}
	return value === "true";
}
