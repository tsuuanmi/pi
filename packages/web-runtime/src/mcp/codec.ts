import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { WebTool } from "../types.ts";
import { CapabilityError } from "./capability.ts";

export type JsonSchema = {
	type: "object";
	properties?: Record<string, object>;
	required?: string[];
	[key: string]: unknown;
};

export function toJsonSchema(value: unknown): JsonSchema {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new CapabilityError("tool schema must be an object");
	const schema = value as Record<string, unknown>;
	if (schema.type !== "object") throw new CapabilityError("tool schema must have object type");
	return schema as JsonSchema;
}

export function toArguments(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new CapabilityError("tool input must be an object");
	return value as Record<string, unknown>;
}

export function normalizeTools(tools: readonly WebTool[]): readonly WebTool[] {
	const normalized = tools.map((tool) => ({ ...tool, inputSchema: toJsonSchema(tool.inputSchema) }));
	const names = new Set<string>();
	for (const tool of normalized) {
		if (!tool.name || names.has(tool.name)) throw new CapabilityError(`duplicate tool: ${tool.name}`);
		names.add(tool.name);
	}
	return normalized;
}

export function encode(value: unknown): string {
	if (value === undefined) return JSON.stringify({ kind: "undefined" });
	const encoded = JSON.stringify({ kind: "value", value });
	if (encoded === undefined) throw new Error("tool result is not serializable");
	return encoded;
}

export function decode(content: CallToolResult["content"]): unknown {
	if (content.length !== 1 || content[0]?.type !== "text")
		throw new CapabilityError("tool returned unsupported content");
	let value: unknown;
	try {
		value = JSON.parse(content[0].text);
	} catch (error) {
		throw new CapabilityError("tool returned invalid content", { cause: error });
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new CapabilityError("tool returned invalid content");
	const record = value as { kind?: unknown; value?: unknown };
	if (record.kind === "undefined") return undefined;
	if (record.kind !== "value") throw new CapabilityError("tool returned invalid content");
	return record.value;
}

export function toolError(message: string): CallToolResult {
	return { isError: true, content: [{ type: "text", text: message }] };
}

export function readToolError(content: CallToolResult["content"]): string {
	return content.find((item) => item.type === "text")?.text ?? "tool call failed";
}
