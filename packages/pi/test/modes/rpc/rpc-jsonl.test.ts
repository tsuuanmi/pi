import { Readable } from "node:stream";
import { attachJsonlLineReader, serializeJsonLine } from "@tsuuanmi/pi-agent/node";
import { describe, expect, test } from "vitest";

describe("RPC JSONL framing", () => {
	test("serializes strict JSONL records without escaping Unicode separators", () => {
		const line = serializeJsonLine({ text: "a\u2028b\u2029c" });

		expect(line).toContain("a\u2028b\u2029c");
		expect(line.endsWith("\n")).toBe(true);
		expect(JSON.parse(line.trim())).toEqual({ text: "a\u2028b\u2029c" });
	});

	test("splits on LF only and preserves U+2028/U+2029 inside payloads", async () => {
		const lines: string[] = [];
		const errors: Error[] = [];
		const stream = Readable.from([serializeJsonLine({ text: "a\u2028b\u2029c" })]);

		const done = new Promise<void>((resolve) => {
			stream.on("end", resolve);
		});

		attachJsonlLineReader(
			stream,
			(line) => {
				lines.push(line);
			},
			(error) => errors.push(error),
		);

		await done;

		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0])).toEqual({ text: "a\u2028b\u2029c" });
		expect(errors).toEqual([]);
	});

	test("rejects CRLF-delimited input", async () => {
		const lines: string[] = [];
		const errors: Error[] = [];
		const stream = Readable.from([Buffer.from('{"a":1}\r\n{"b":2}\r\n')]);

		const done = new Promise<void>((resolve) => {
			stream.on("end", resolve);
		});

		attachJsonlLineReader(
			stream,
			(line) => {
				lines.push(line);
			},
			(error) => errors.push(error),
		);

		await done;

		expect(lines).toEqual([]);
		expect(errors).toHaveLength(1);
		expect(errors[0]?.message).toBe("JSONL records must use LF delimiters");
	});

	test("rejects a final line without trailing LF", async () => {
		const lines: string[] = [];
		const errors: Error[] = [];
		const stream = Readable.from([Buffer.from('{"a":1}')]);

		const done = new Promise<void>((resolve) => {
			stream.on("end", resolve);
		});

		attachJsonlLineReader(
			stream,
			(line) => {
				lines.push(line);
			},
			(error) => errors.push(error),
		);

		await done;

		expect(lines).toEqual([]);
		expect(errors).toHaveLength(1);
		expect(errors[0]?.message).toBe("JSONL stream ended before a record delimiter");
	});

	test("reports line handler errors", async () => {
		const errors: Error[] = [];
		const stream = Readable.from([serializeJsonLine({ ok: true })]);

		const done = new Promise<void>((resolve) => {
			stream.on("end", resolve);
		});

		attachJsonlLineReader(
			stream,
			() => {
				throw new Error("line handler failed");
			},
			(error) => errors.push(error),
		);

		await done;

		expect(errors).toHaveLength(1);
		expect(errors[0]?.message).toBe("line handler failed");
	});
});
