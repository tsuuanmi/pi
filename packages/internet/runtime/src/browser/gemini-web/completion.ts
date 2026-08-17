import type { Page } from "playwright-core";

import {
	GEMINI_RESPONSE_SELECTOR,
	GEMINI_STOP_BUTTON_SELECTOR,
} from "#runtime/browser/gemini-web/session";

export interface GeminiResponseDomSnapshot {
	responsePresent: boolean;
	currentText: string;
	currentHtml: string;
	running: boolean;
}

export async function geminiResponseDomSnapshot(page: Page): Promise<GeminiResponseDomSnapshot> {
	const response = page.locator(GEMINI_RESPONSE_SELECTOR).filter({ visible: true }).last();
	if (await response.count() === 0) {
		return { responsePresent: false, currentText: "", currentHtml: "", running: false };
	}
	const [currentText, currentHtml, running] = await Promise.all([
		response.innerText(),
		response.innerHTML(),
		page.locator(GEMINI_STOP_BUTTON_SELECTOR).filter({ visible: true }).count().then(count => count > 0),
	]);
	return { responsePresent: true, currentText: currentText.trim(), currentHtml, running };
}
