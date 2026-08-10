import type { Locator, Page } from "playwright";

export type ChatGptErrorCode = "rate_limit" | "session" | "upstream";

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
		.filter({ hasText: /making requests too quickly/i });
	if (await visible(rateLimit)) {
		const acknowledge = rateLimit.getByRole("button", { name: "Got it", exact: true });
		if (await visible(acknowledge)) await acknowledge.press("Enter");
		throw new ChatGptError("rate_limit", "ChatGPT rate limit: requests are being made too quickly");
	}

	const session = page.locator('[role="alert"]').filter({ hasText: /Failed to load subscription/i });
	if (await visible(session)) {
		throw new ChatGptError("session", "ChatGPT could not load the account subscription");
	}
}

export async function checkTurn(response: Locator): Promise<void> {
	const upstream = response.getByText(/Something went wrong[\s\S]*help\.openai\.com/i);
	if (await visible(upstream)) throw new ChatGptError("upstream", "ChatGPT ended the turn with an upstream error");
}

async function visible(locator: Locator): Promise<boolean> {
	if ((await locator.count()) === 0) return false;
	return locator.last().isVisible();
}
