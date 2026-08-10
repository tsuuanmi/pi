import { describe, expect, test } from "vitest";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
	validateAttachments,
} from "../../../src/providers/chatgpt/attachments.ts";
import { CHATGPT_ROUTES } from "../../../src/providers/chatgpt/routes.ts";

const file = (size: number) => ({ name: "notes.txt", mediaType: "text/plain", data: new Uint8Array(size) });

describe("ChatGPT attachments", () => {
	test("accepts bounded file attachments for a file-capable route", () => {
		expect(() => validateAttachments(CHATGPT_ROUTES[0], [file(1)])).not.toThrow();
	});

	test("rejects excessive count and size", () => {
		expect(() =>
			validateAttachments(
				CHATGPT_ROUTES[0],
				Array.from({ length: MAX_ATTACHMENTS + 1 }, () => file(1)),
			),
		).toThrow("at most");
		expect(() => validateAttachments(CHATGPT_ROUTES[0], [file(MAX_ATTACHMENT_BYTES + 1)])).toThrow("exceed");
	});

	test("rejects malformed or duplicate attachment metadata", () => {
		expect(() => validateAttachments(CHATGPT_ROUTES[0], [{ ...file(1), name: "../notes.txt" }])).toThrow("name");
		expect(() => validateAttachments(CHATGPT_ROUTES[0], [file(1), file(1)])).toThrow("duplicate");
		expect(() => validateAttachments(CHATGPT_ROUTES[0], [{ ...file(1), mediaType: "text" }])).toThrow("media type");
	});
});
