import type { Page } from "playwright";
import type { WebAttachment } from "../../types.ts";
import { activeComposer } from "./composer.ts";
import type { ChatGptRoute } from "./routes.ts";
import { FILE_INPUT } from "./selectors.ts";
import { throwIfAborted } from "./wait.ts";

export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export function validateAttachments(route: ChatGptRoute, attachments: readonly WebAttachment[]): void {
	if (attachments.length > MAX_ATTACHMENTS) throw new Error(`ChatGPT accepts at most ${MAX_ATTACHMENTS} attachments`);
	if (attachments.length > 0 && !route.input.includes("file")) {
		throw new Error(`ChatGPT route does not accept attachments: ${route.id}`);
	}
	let totalBytes = 0;
	const names = new Set<string>();
	for (const attachment of attachments) {
		if (!/^[^\0/\\]{1,255}$/.test(attachment.name)) throw new Error(`invalid attachment name: ${attachment.name}`);
		if (names.has(attachment.name)) throw new Error(`duplicate attachment name: ${attachment.name}`);
		names.add(attachment.name);
		if (!/^[^\s/]+\/[^\s]+$/.test(attachment.mediaType)) {
			throw new Error(`invalid attachment media type: ${attachment.mediaType}`);
		}
		if (attachment.data.byteLength === 0) throw new Error(`empty attachment: ${attachment.name}`);
		totalBytes += attachment.data.byteLength;
		if (totalBytes > MAX_ATTACHMENT_BYTES) {
			throw new Error(`attachments exceed ${MAX_ATTACHMENT_BYTES} bytes`);
		}
	}
}

export async function uploadAttachments(
	page: Page,
	route: ChatGptRoute,
	attachments: readonly WebAttachment[],
	signal: AbortSignal,
): Promise<void> {
	validateAttachments(route, attachments);
	throwIfAborted(signal);
	if (attachments.length === 0) return;

	const composer = await activeComposer(page, signal);
	const form = composer.locator("xpath=ancestor::form[1]");
	const input = form.locator(FILE_INPUT);
	await input.waitFor({ state: "attached", timeout: 30_000, signal });
	if ((await input.count()) !== 1) throw new Error("ChatGPT did not expose exactly one attachment input");
	await input.setInputFiles(
		attachments.map((attachment) => ({
			name: attachment.name,
			mimeType: attachment.mediaType,
			buffer: Buffer.from(attachment.data),
		})),
	);
	throwIfAborted(signal);

	try {
		await Promise.all(
			attachments.map((attachment) =>
				form.getByRole("group", { name: attachment.name, exact: true }).waitFor({
					state: "visible",
					timeout: 60_000,
					signal,
				}),
			),
		);
	} catch (error) {
		throwIfAborted(signal);
		const alert = form.locator('[role="alert"]').last();
		const detail = (await alert.isVisible()) ? (await alert.innerText()).trim() : "attachment did not become ready";
		throw new Error(`ChatGPT rejected an attachment: ${detail}`, { cause: error });
	}
}
