import {
	GEMINI_COMPOSER_SELECTOR,
	GEMINI_MODEL_MENU_BUTTON_SELECTOR,
	GEMINI_MODEL_MENU_ITEM_SELECTOR,
	GEMINI_SEND_BUTTON_SELECTOR,
	GEMINI_STOP_BUTTON_SELECTOR,
} from "#runtime/browser/gemini-web/session";

describe("Gemini browser interaction selectors", () => {
	it("keeps the provider DOM contract exact", () => {
		expect(GEMINI_COMPOSER_SELECTOR).toBe('rich-textarea [contenteditable="true"]');
		expect(GEMINI_SEND_BUTTON_SELECTOR).toBe('input-area-v2 button[aria-label="Send message"]');
		expect(GEMINI_STOP_BUTTON_SELECTOR).toBe('button[aria-label="Stop response"]');
		expect(GEMINI_MODEL_MENU_BUTTON_SELECTOR).toBe("bard-mode-switcher button");
		expect(GEMINI_MODEL_MENU_ITEM_SELECTOR).toBe('.cdk-overlay-pane gem-menu-item[role="menuitem"]');
	});
});
