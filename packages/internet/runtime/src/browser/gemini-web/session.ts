import type { Page } from "playwright-core";

import {
	modelIdForGeminiLabel,
	normalizeGeminiModelLabel,
	type GeminiWebModelId,
} from "#runtime/browser/gemini-web/capabilities";

export const GEMINI_HOME_URL = "https://gemini.google.com/app";
export const GEMINI_AUTHENTICATED_ANCHOR_URL = "https://accounts.google.com/SignOutOptions";
export const GEMINI_SIGN_IN_BUTTON_SELECTOR = 'button[aria-label="Sign in"]';
export const GEMINI_COMPOSER_SELECTOR = 'rich-textarea [contenteditable="true"]';
export const GEMINI_SEND_BUTTON_SELECTOR = 'input-area-v2 button[aria-label="Send message"]';
export const GEMINI_STOP_BUTTON_SELECTOR = 'button[aria-label="Stop response"]';
export const GEMINI_MODEL_MENU_BUTTON_SELECTOR = "bard-mode-switcher button";
export const GEMINI_MODEL_MENU_ITEM_SELECTOR = '.cdk-overlay-pane gem-menu-item[role="menuitem"]';
export const GEMINI_RESPONSE_SELECTOR = "model-response .model-response-text message-content .markdown.markdown-main-panel";

type GeminiModelLabels = Partial<Record<GeminiWebModelId, string>>;

export function parseGeminiConversationUrl(value: string): string | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	if (
		url.origin !== new URL(GEMINI_HOME_URL).origin
		|| !/^\/app\/[a-z0-9]+$/.test(url.pathname)
		|| url.search
		|| url.hash
	) {
		return undefined;
	}
	return url.href;
}

function mapGeminiModelLabels(labels: readonly string[]): GeminiModelLabels {
	const mapped: GeminiModelLabels = {};
	for (const label of labels) {
		const kind = modelIdForGeminiLabel(label);
		if (kind === undefined || mapped[kind] !== undefined) continue;
		mapped[kind] = normalizeGeminiModelLabel(label);
	}
	return mapped;
}

export async function detectGeminiModelLabels(page: Page, timeoutMs = 10_000): Promise<GeminiModelLabels> {
	const menuButton = page.locator(GEMINI_MODEL_MENU_BUTTON_SELECTOR).last();
	await menuButton.waitFor({ state: "visible", timeout: timeoutMs });
	await menuButton.click();
	const menuItems = page.locator(GEMINI_MODEL_MENU_ITEM_SELECTOR).filter({ visible: true });
	try {
		await menuItems.first().waitFor({ state: "visible", timeout: timeoutMs });
		return mapGeminiModelLabels(await menuItems.allInnerTexts());
	} finally {
		await page.keyboard.press("Escape").catch(() => {});
	}
}
