import type { Locator, Page } from "playwright";

export type ChatGptErrorCode = "rate_limit" | "subscription" | "upstream";

export class ChatGptError extends Error {
	readonly code: ChatGptErrorCode;

	constructor(code: ChatGptErrorCode, message: string) {
		super(message);
		this.name = "ChatGptError";
		this.code = code;
	}
}

export async function checkPage(page: Page): Promise<void> {
	const rateLimit = page
		.locator('[role="dialog"]')
		.filter({ hasText: /Too many requests/i })
		.filter({
			hasText: /making requests too quickly/i,
		});
	if (await isVisible(rateLimit)) {
		throw new ChatGptError("rate_limit", "ChatGPT rate limit: requests are being made too quickly");
	}

	const subscription = page.locator('[role="alert"]').filter({ hasText: /Failed to load subscription/i });
	if (await isVisible(subscription)) {
		throw new ChatGptError("subscription", "ChatGPT could not load the account subscription");
	}

	const upstream = page.getByText(/Something went wrong[\s\S]*help\.openai\.com/i);
	if (await isVisible(upstream)) throw new ChatGptError("upstream", "ChatGPT ended the turn with an upstream error");
}

async function isVisible(locator: Locator): Promise<boolean> {
	return locator.last().isVisible();
}
