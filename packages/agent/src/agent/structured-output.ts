import type { Static, TSchema } from "typebox";
import { Compile } from "typebox/compile";

export interface StructuredOutputOptions<TSchemaValue extends TSchema = TSchema> {
	schema: TSchemaValue;
	/** Additional task-specific instructions appended before the JSON contract. */
	instructions?: string;
	/** Retry count for high-level helpers that call the model. Default: 0. */
	retryOnInvalid?: number | boolean;
}

export interface StructuredOutputSuccess<T> {
	ok: true;
	value: T;
	rawText: string;
	jsonText: string;
}

export interface StructuredOutputFailure {
	ok: false;
	error: string;
	rawText: string;
	jsonText?: string;
	issues?: string[];
}

export type StructuredOutputResult<T> = StructuredOutputSuccess<T> | StructuredOutputFailure;

export function createStructuredOutputPrompt<TSchemaValue extends TSchema>(
	prompt: string,
	options: StructuredOutputOptions<TSchemaValue>,
): string {
	const sections = [prompt.trim()];
	if (options.instructions?.trim()) {
		sections.push(options.instructions.trim());
	}
	sections.push(
		[
			"Return only valid JSON that matches this JSON Schema.",
			"Do not wrap the JSON in markdown fences. Do not include explanatory text outside the JSON value.",
			JSON.stringify(options.schema, null, 2),
		].join("\n"),
	);
	return sections.filter(Boolean).join("\n\n");
}

export function parseStructuredOutput<TSchemaValue extends TSchema>(
	text: string,
	schema: TSchemaValue,
): StructuredOutputResult<Static<TSchemaValue>> {
	const jsonText = extractJsonValue(text);
	if (!jsonText) {
		return { ok: false, error: "No JSON value found in model output", rawText: text };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
			rawText: text,
			jsonText,
		};
	}

	const validator = Compile(schema);
	if (!validator.Check(parsed)) {
		const issues = [...validator.Errors(parsed)].map((issue) => `${issue.instancePath || "/"}: ${issue.message}`);
		return {
			ok: false,
			error: issues[0] ?? "Structured output did not match schema",
			rawText: text,
			jsonText,
			issues,
		};
	}

	return { ok: true, value: parsed as Static<TSchemaValue>, rawText: text, jsonText };
}

export function getStructuredOutputRetryLimit(retryOnInvalid: boolean | number | undefined): number {
	if (retryOnInvalid === true) return 1;
	if (retryOnInvalid === false || retryOnInvalid === undefined) return 0;
	return Math.max(0, Math.floor(retryOnInvalid));
}

export function createStructuredOutputRepairPrompt(error: StructuredOutputFailure): string {
	const details = error.issues && error.issues.length > 0 ? `\nIssues:\n${error.issues.join("\n")}` : "";
	return `Your previous response was not valid structured JSON: ${error.error}.${details}\nReturn only corrected JSON that matches the requested schema.`;
}

function extractJsonValue(text: string): string | undefined {
	const trimmed = text.trim();
	if (!trimmed) return undefined;
	if (startsJsonValue(trimmed[0])) {
		return scanJsonValue(trimmed, 0);
	}

	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) {
		const candidate = fenced[1].trim();
		if (startsJsonValue(candidate[0])) {
			return scanJsonValue(candidate, 0);
		}
	}

	for (let index = 0; index < trimmed.length; index += 1) {
		if (startsJsonValue(trimmed[index])) {
			const candidate = scanJsonValue(trimmed, index);
			if (candidate) return candidate;
		}
	}
	return undefined;
}

function startsJsonValue(char: string | undefined): boolean {
	return char === "{" || char === "[";
}

function scanJsonValue(text: string, start: number): string | undefined {
	const open = text[start];
	const close = open === "{" ? "}" : "]";
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === open) depth += 1;
		if (char === close) {
			depth -= 1;
			if (depth === 0) return text.slice(start, index + 1);
		}
	}
	return undefined;
}
