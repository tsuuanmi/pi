import { stripAnsi } from "@tsuuanmi/pi-tui";
import type { BashOperations } from "#pi/execution/backend";
import { OutputBuffer } from "#pi/output/buffer";
import { sanitizeBinaryOutput } from "#pi/output/sanitize";

export interface BashRunOptions {
	onChunk?: (chunk: string) => void;
	signal?: AbortSignal;
}

export interface BashResult {
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
}

function sanitizeOutput(value: string): string {
	return sanitizeBinaryOutput(stripAnsi(value)).replace(/\r/g, "");
}

export async function runBash(
	command: string,
	cwd: string,
	backend: BashOperations,
	options?: BashRunOptions,
): Promise<BashResult> {
	const output = new OutputBuffer({ tempFilePrefix: "pi-bash" });
	const decoder = new TextDecoder();

	const onData = (data: Buffer): void => {
		output.append(data);
		const text = sanitizeOutput(decoder.decode(data, { stream: true }));
		if (text) options?.onChunk?.(text);
	};

	const finish = async (): Promise<{ content: string; truncated: boolean; fullOutputPath?: string }> => {
		const tail = sanitizeOutput(decoder.decode());
		if (tail) options?.onChunk?.(tail);
		output.finish();
		const snapshot = output.snapshot({ persistIfTruncated: true });
		await output.closeTempFile();
		return {
			content: sanitizeOutput(snapshot.content),
			truncated: snapshot.truncation.truncated,
			fullOutputPath: snapshot.fullOutputPath,
		};
	};

	try {
		const result = await backend.exec(command, cwd, {
			onData,
			signal: options?.signal,
		});
		const snapshot = await finish();
		const cancelled = options?.signal?.aborted ?? false;
		return {
			output: snapshot.content,
			exitCode: cancelled ? undefined : (result.exitCode ?? undefined),
			cancelled,
			truncated: snapshot.truncated,
			fullOutputPath: snapshot.fullOutputPath,
		};
	} catch (error) {
		const snapshot = await finish();
		if (options?.signal?.aborted) {
			return {
				output: snapshot.content,
				exitCode: undefined,
				cancelled: true,
				truncated: snapshot.truncated,
				fullOutputPath: snapshot.fullOutputPath,
			};
		}
		throw error;
	}
}
