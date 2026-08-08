import type { Page } from "playwright";
import type { WebAttachment } from "../../types.ts";
import type { ChatGptRoute } from "./routes.ts";
import { FILE_INPUT_SELECTOR } from "./selectors.ts";

export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export function validateAttachments(route: ChatGptRoute, attachments: readonly WebAttachment[]): void {
	if (attachments.length > MAX_ATTACHMENTS) throw new Error(`ChatGPT accepts at most ${MAX_ATTACHMENTS} attachments`);
	if (attachments.length > 0 && !route.input.includes("file")) {
		throw new Error(`ChatGPT route does not accept attachments: ${route.id}`);
	}
	let totalBytes = 0;
	for (const attachment of attachments) {
		if (!/^[^\0/\\]{1,255}$/.test(attachment.name)) throw new Error(`invalid attachment name: ${attachment.name}`);
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
	signal?: AbortSignal,
): Promise<void> {
	validateAttachments(route, attachments);
	if (signal?.aborted) throw signal.reason;
	if (attachments.length === 0) return;
	const input = page.locator(FILE_INPUT_SELECTOR);
	await input.waitFor({ state: "attached", timeout: 30_000 });
	await input.setInputFiles(
		attachments.map((attachment) => ({
			name: attachment.name,
			mimeType: attachment.mediaType,
			buffer: Buffer.from(attachment.data),
		})),
	);
	const count = await input.evaluate((element) => {
		const input = element as unknown as { files?: { length: number } };
		return input.files?.length ?? 0;
	});
	if (signal?.aborted) throw signal.reason;
	if (count !== attachments.length) throw new Error("ChatGPT did not accept all attachments");
}
