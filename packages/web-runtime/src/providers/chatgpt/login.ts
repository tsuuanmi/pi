import type { Page } from "playwright";
import { BrowserSession } from "../../session.ts";
import type { WebProviderEntitlement } from "../../types.ts";
import { activeComposer } from "./composer.ts";
import { availableRoutes } from "./effort.ts";
import { checkPage } from "./errors.ts";
import { TEMP_CHAT_URL } from "./selectors.ts";
import { abortable, throwIfAborted } from "./wait.ts";

export async function verifyChatGptLogin(profileDir: string, signal: AbortSignal): Promise<WebProviderEntitlement> {
	throwIfAborted(signal);
	const session = await BrowserSession.open(profileDir);
	try {
		const page = await session.openTurn("verify");
		await abortable(page.goto(TEMP_CHAT_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }), signal);
		await checkPage(page);
		await activeComposer(page, signal, 600_000);
		await assertAuthenticated(page);
		assertTemporaryChat(page);
		return { routes: await availableRoutes(page, signal) };
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

async function assertAuthenticated(page: Page): Promise<void> {
	const auth = page.locator('[data-testid="login-button"], [data-testid="signup-button"]').filter({ visible: true });
	if ((await auth.count()) > 0) throw new Error("ChatGPT login is required");
}
