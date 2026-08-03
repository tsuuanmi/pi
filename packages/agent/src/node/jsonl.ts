import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

/**
 * Serialize a single strict JSONL record.
 *
 * Framing is LF-only. Payload strings may contain other Unicode separators such as
 * U+2028 and U+2029. Clients must split records on `\n` only.
 */
export function serializeJsonLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

/**
 * Attach an LF-only JSONL reader to a stream.
 *
 * `onError` receives framing errors and exceptions from `onLine`; the reader
 * detaches after reporting the first error.
 *
 * This intentionally does not use Node readline. Readline splits on additional
 * Unicode separators that are valid inside JSON strings and therefore does not
 * implement strict JSONL framing.
 */
export function attachJsonlLineReader(
	stream: Readable,
	onLine: (line: string) => void,
	onError: (error: Error) => void,
): () => void {
	const decoder = new StringDecoder("utf8");
	let buffer = "";
	let stopped = false;

	const cleanup = () => {
		if (stopped) return;
		stopped = true;
		stream.off("data", onData);
		stream.off("end", onEnd);
	};

	const fail = (error: unknown) => {
		cleanup();
		onError(error instanceof Error ? error : new Error(String(error)));
	};

	const emitLine = (line: string): boolean => {
		if (line.endsWith("\r")) {
			fail(new Error("JSONL records must use LF delimiters"));
			return false;
		}
		try {
			onLine(line);
			return true;
		} catch (error) {
			fail(error);
			return false;
		}
	};

	const onData = (chunk: string | Buffer) => {
		if (stopped) return;
		buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);

		while (true) {
			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex === -1) {
				return;
			}

			if (!emitLine(buffer.slice(0, newlineIndex))) return;
			buffer = buffer.slice(newlineIndex + 1);
		}
	};

	const onEnd = () => {
		if (stopped) return;
		buffer += decoder.end();
		if (buffer.length > 0) {
			fail(new Error("JSONL stream ended before a record delimiter"));
		}
	};

	stream.on("data", onData);
	stream.on("end", onEnd);

	return cleanup;
}
