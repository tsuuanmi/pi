import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeSession, SessionFormatError } from "#pi/session/codec";
import { type FileEntry, SESSION_VERSION, type SessionHeader } from "#pi/session/types";

const timestamp = "2026-01-01T00:00:00.000Z";

function header(overrides: Partial<SessionHeader> = {}): SessionHeader {
	return {
		type: "session",
		version: SESSION_VERSION,
		id: "session-1",
		timestamp,
		cwd: resolve("project"),
		...overrides,
	};
}

function encode(entries: readonly unknown[]): string {
	return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

describe("decodeSession", () => {
	it("decodes the current format", () => {
		const entries = decodeSession(
			encode([
				header(),
				{ type: "custom", id: "00000001", parentId: null, timestamp, customType: "test", data: { ok: true } },
			]),
		);

		expect(entries).toHaveLength(2);
		expect((entries[0] as SessionHeader).version).toBe(SESSION_VERSION);
	});

	it.each([undefined, 1, 2, 5])("rejects unsupported version %s", (version) => {
		const value = { ...header(), version } as unknown as FileEntry;
		expect(() => decodeSession(encode([value]))).toThrow(SessionFormatError);
	});

	it("accepts legacy version 3 session headers", () => {
		const value = { ...header(), version: 3 } as unknown as FileEntry;
		const entries = decodeSession(encode([value]));
		expect((entries[0] as SessionHeader).version).toBe(3);
	});

	it("rejects malformed JSON without skipping the line", () => {
		expect(() => decodeSession(`${JSON.stringify(header())}\nnot-json\n`, "session.jsonl")).toThrow(
			"session.jsonl:2: line is not valid JSON",
		);
	});

	it("rejects blank lines", () => {
		expect(() => decodeSession(`${JSON.stringify(header())}\n\n`)).toThrow("blank lines are not allowed");
	});

	it("rejects unsupported entries and fields", () => {
		const base = { id: "00000001", parentId: null, timestamp };
		expect(() => decodeSession(encode([header(), { ...base, type: "obsolete" }]))).toThrow(
			'entry.type "obsolete" is not supported',
		);
		expect(() =>
			decodeSession(encode([header(), { ...base, type: "custom", customType: "test", obsolete: true }])),
		).toThrow("entry.obsolete is not supported");
	});

	it("rejects duplicate ids and missing parents", () => {
		const first = { type: "custom", id: "00000001", parentId: null, timestamp, customType: "first" };
		expect(() => decodeSession(encode([header(), first, { ...first, customType: "duplicate" }]))).toThrow(
			'duplicate entry id "00000001"',
		);
		expect(() =>
			decodeSession(
				encode([
					header(),
					{ type: "custom", id: "00000002", parentId: "00000001", timestamp, customType: "orphan" },
				]),
			),
		).toThrow('parent entry "00000001" must appear before its child');
	});
});
