import { isAbsolute } from "node:path";
import { isValidThinkingLevel } from "@tsuuanmi/pi-ai";
import { assertPiSessionId, isEntryId } from "#pi/session/id";
import { type FileEntry, SESSION_VERSION, type SessionEntry, type SessionHeader } from "#pi/session/types";

type JsonObject = Record<string, unknown>;

const ENTRY_KEYS = ["type", "id", "parentId", "timestamp"] as const;
const STOP_REASONS = new Set(["stop", "length", "toolUse", "error", "aborted"]);

export class SessionFormatError extends Error {
	readonly source: string;
	readonly line?: number;

	constructor(source: string, message: string, line?: number) {
		super(`${source}${line === undefined ? "" : `:${line}`}: ${message}`);
		this.name = "SessionFormatError";
		this.source = source;
		this.line = line;
	}
}

function fail(source: string, line: number, message: string): never {
	throw new SessionFormatError(source, message, line);
}

function object(value: unknown, source: string, line: number, path: string): JsonObject {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		fail(source, line, `${path} must be an object`);
	}
	return value as JsonObject;
}

function keys(
	value: JsonObject,
	required: readonly string[],
	optional: readonly string[],
	source: string,
	line: number,
	path: string,
): void {
	const allowed = new Set([...required, ...optional]);
	for (const key of required) {
		if (!Object.hasOwn(value, key)) fail(source, line, `${path}.${key} is required`);
	}
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) fail(source, line, `${path}.${key} is not supported`);
	}
}

function string(value: unknown, source: string, line: number, path: string, allowEmpty = false): string {
	if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
		fail(source, line, `${path} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
	}
	return value;
}

function number(value: unknown, source: string, line: number, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) fail(source, line, `${path} must be a finite number`);
	return value;
}

function integer(value: unknown, source: string, line: number, path: string, minimum?: number): number {
	const result = number(value, source, line, path);
	if (!Number.isInteger(result) || (minimum !== undefined && result < minimum)) {
		fail(source, line, `${path} must be an integer${minimum === undefined ? "" : ` >= ${minimum}`}`);
	}
	return result;
}

function boolean(value: unknown, source: string, line: number, path: string): boolean {
	if (typeof value !== "boolean") fail(source, line, `${path} must be a boolean`);
	return value;
}

function timestamp(value: unknown, source: string, line: number, path: string): string {
	const result = string(value, source, line, path);
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || Number.isNaN(Date.parse(result))) {
		fail(source, line, `${path} must be an ISO 8601 UTC timestamp`);
	}
	return result;
}

function optionalString(value: JsonObject, key: string, source: string, line: number, path: string): void {
	if (Object.hasOwn(value, key)) string(value[key], source, line, `${path}.${key}`);
}

function textContent(value: unknown, source: string, line: number, path: string): void {
	const content = object(value, source, line, path);
	keys(content, ["type", "text"], ["textSignature"], source, line, path);
	if (content.type !== "text") fail(source, line, `${path}.type must be "text"`);
	string(content.text, source, line, `${path}.text`, true);
	optionalString(content, "textSignature", source, line, path);
}

function content(value: unknown, source: string, line: number, path: string): void {
	const block = object(value, source, line, path);
	if (block.type === "text") {
		textContent(block, source, line, path);
		return;
	}
	if (block.type === "thinking") {
		keys(block, ["type", "thinking"], ["thinkingSignature", "redacted"], source, line, path);
		string(block.thinking, source, line, `${path}.thinking`, true);
		optionalString(block, "thinkingSignature", source, line, path);
		if (Object.hasOwn(block, "redacted")) boolean(block.redacted, source, line, `${path}.redacted`);
		return;
	}
	if (block.type === "toolCall") {
		keys(block, ["type", "id", "name", "arguments"], ["thoughtSignature"], source, line, path);
		string(block.id, source, line, `${path}.id`);
		string(block.name, source, line, `${path}.name`);
		object(block.arguments, source, line, `${path}.arguments`);
		optionalString(block, "thoughtSignature", source, line, path);
		return;
	}
	fail(source, line, `${path}.type is not supported`);
}

function contentArray(
	value: unknown,
	source: string,
	line: number,
	path: string,
	validate: (value: unknown, source: string, line: number, path: string) => void,
): void {
	if (!Array.isArray(value)) fail(source, line, `${path} must be an array`);
	value.forEach((item, index) => {
		validate(item, source, line, `${path}[${index}]`);
	});
}

function usage(value: unknown, source: string, line: number, path: string): void {
	const usageValue = object(value, source, line, path);
	keys(
		usageValue,
		["input", "output", "cacheRead", "cacheWrite", "totalTokens", "cost"],
		["cacheWrite1h"],
		source,
		line,
		path,
	);
	for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) {
		number(usageValue[key], source, line, `${path}.${key}`);
	}
	if (Object.hasOwn(usageValue, "cacheWrite1h")) number(usageValue.cacheWrite1h, source, line, `${path}.cacheWrite1h`);
	const cost = object(usageValue.cost, source, line, `${path}.cost`);
	keys(cost, ["input", "output", "cacheRead", "cacheWrite", "total"], [], source, line, `${path}.cost`);
	for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
		number(cost[key], source, line, `${path}.cost.${key}`);
	}
}

function message(value: unknown, source: string, line: number): void {
	const messageValue = object(value, source, line, "entry.message");
	const role = string(messageValue.role, source, line, "entry.message.role");
	const path = "entry.message";

	if (role === "user") {
		keys(messageValue, ["role", "content", "timestamp"], [], source, line, path);
		if (typeof messageValue.content !== "string") {
			contentArray(messageValue.content, source, line, `${path}.content`, textContent);
		}
		number(messageValue.timestamp, source, line, `${path}.timestamp`);
		return;
	}

	if (role === "assistant") {
		keys(
			messageValue,
			["role", "content", "api", "provider", "model", "usage", "stopReason", "timestamp"],
			["responseModel", "responseId", "diagnostics", "usageProvenance", "errorMessage"],
			source,
			line,
			path,
		);
		contentArray(messageValue.content, source, line, `${path}.content`, content);
		for (const key of ["api", "provider", "model"] as const)
			string(messageValue[key], source, line, `${path}.${key}`);
		for (const key of ["responseModel", "responseId", "errorMessage"] as const)
			optionalString(messageValue, key, source, line, path);
		if (Object.hasOwn(messageValue, "diagnostics") && !Array.isArray(messageValue.diagnostics)) {
			fail(source, line, `${path}.diagnostics must be an array`);
		}
		if (Object.hasOwn(messageValue, "usageProvenance"))
			object(messageValue.usageProvenance, source, line, `${path}.usageProvenance`);
		usage(messageValue.usage, source, line, `${path}.usage`);
		if (!STOP_REASONS.has(String(messageValue.stopReason))) fail(source, line, `${path}.stopReason is not supported`);
		number(messageValue.timestamp, source, line, `${path}.timestamp`);
		return;
	}

	if (role === "toolResult") {
		keys(
			messageValue,
			["role", "toolCallId", "toolName", "content", "isError", "timestamp"],
			["details"],
			source,
			line,
			path,
		);
		string(messageValue.toolCallId, source, line, `${path}.toolCallId`);
		string(messageValue.toolName, source, line, `${path}.toolName`);
		contentArray(messageValue.content, source, line, `${path}.content`, textContent);
		boolean(messageValue.isError, source, line, `${path}.isError`);
		number(messageValue.timestamp, source, line, `${path}.timestamp`);
		return;
	}

	if (role === "bashExecution") {
		keys(
			messageValue,
			["role", "command", "output", "cancelled", "truncated", "timestamp"],
			["exitCode", "fullOutputPath", "excludeFromContext"],
			source,
			line,
			path,
		);
		string(messageValue.command, source, line, `${path}.command`, true);
		string(messageValue.output, source, line, `${path}.output`, true);
		if (Object.hasOwn(messageValue, "exitCode")) integer(messageValue.exitCode, source, line, `${path}.exitCode`);
		optionalString(messageValue, "fullOutputPath", source, line, path);
		if (Object.hasOwn(messageValue, "excludeFromContext"))
			boolean(messageValue.excludeFromContext, source, line, `${path}.excludeFromContext`);
		boolean(messageValue.cancelled, source, line, `${path}.cancelled`);
		boolean(messageValue.truncated, source, line, `${path}.truncated`);
		number(messageValue.timestamp, source, line, `${path}.timestamp`);
		return;
	}

	if (role === "custom") {
		keys(messageValue, ["role", "customType", "content", "display", "timestamp"], ["details"], source, line, path);
		string(messageValue.customType, source, line, `${path}.customType`);
		if (typeof messageValue.content !== "string")
			contentArray(messageValue.content, source, line, `${path}.content`, textContent);
		boolean(messageValue.display, source, line, `${path}.display`);
		number(messageValue.timestamp, source, line, `${path}.timestamp`);
		return;
	}

	if (role === "branchSummary") {
		keys(messageValue, ["role", "summary", "fromId", "timestamp"], [], source, line, path);
		string(messageValue.summary, source, line, `${path}.summary`);
		string(messageValue.fromId, source, line, `${path}.fromId`);
		number(messageValue.timestamp, source, line, `${path}.timestamp`);
		return;
	}

	if (role === "compactionSummary") {
		keys(messageValue, ["role", "summary", "tokensBefore", "timestamp"], [], source, line, path);
		string(messageValue.summary, source, line, `${path}.summary`);
		integer(messageValue.tokensBefore, source, line, `${path}.tokensBefore`, 0);
		number(messageValue.timestamp, source, line, `${path}.timestamp`);
		return;
	}

	fail(source, line, `entry.message.role "${role}" is not supported`);
}

function entryBase(value: JsonObject, source: string, line: number): void {
	string(value.id, source, line, "entry.id");
	if (!isEntryId(value.id as string)) fail(source, line, "entry.id must be eight lowercase hexadecimal characters");
	if (value.parentId !== null) {
		string(value.parentId, source, line, "entry.parentId");
		if (!isEntryId(value.parentId as string)) fail(source, line, "entry.parentId must be null or an entry id");
	}
	timestamp(value.timestamp, source, line, "entry.timestamp");
}

function decodeEntry(value: JsonObject, source: string, line: number): SessionEntry {
	const type = string(value.type, source, line, "entry.type");
	const required: string[] = [...ENTRY_KEYS];
	let optional: string[] = [];

	switch (type) {
		case "message":
			required.push("message");
			keys(value, required, optional, source, line, "entry");
			entryBase(value, source, line);
			message(value.message, source, line);
			break;
		case "thinking_level_change":
			required.push("thinkingLevel");
			keys(value, required, optional, source, line, "entry");
			entryBase(value, source, line);
			if (typeof value.thinkingLevel !== "string" || !isValidThinkingLevel(value.thinkingLevel)) {
				fail(source, line, "entry.thinkingLevel is not supported");
			}
			break;
		case "model_change":
			required.push("provider", "modelId");
			keys(value, required, optional, source, line, "entry");
			entryBase(value, source, line);
			string(value.provider, source, line, "entry.provider");
			string(value.modelId, source, line, "entry.modelId");
			break;
		case "compaction":
			required.push("summary", "firstKeptEntryId", "tokensBefore");
			optional = ["details"];
			keys(value, required, optional, source, line, "entry");
			entryBase(value, source, line);
			string(value.summary, source, line, "entry.summary");
			string(value.firstKeptEntryId, source, line, "entry.firstKeptEntryId");
			if (!isEntryId(value.firstKeptEntryId as string))
				fail(source, line, "entry.firstKeptEntryId must be an entry id");
			integer(value.tokensBefore, source, line, "entry.tokensBefore", 0);
			break;
		case "branch_summary":
			required.push("fromId", "summary");
			optional = ["details"];
			keys(value, required, optional, source, line, "entry");
			entryBase(value, source, line);
			string(value.fromId, source, line, "entry.fromId");
			if (value.fromId !== "root" && !isEntryId(value.fromId as string)) {
				fail(source, line, 'entry.fromId must be "root" or an entry id');
			}
			string(value.summary, source, line, "entry.summary");
			break;
		case "custom":
			required.push("customType");
			optional = ["data"];
			keys(value, required, optional, source, line, "entry");
			entryBase(value, source, line);
			string(value.customType, source, line, "entry.customType");
			break;
		case "custom_message":
			required.push("customType", "content", "display");
			optional = ["details"];
			keys(value, required, optional, source, line, "entry");
			entryBase(value, source, line);
			string(value.customType, source, line, "entry.customType");
			if (typeof value.content !== "string") contentArray(value.content, source, line, "entry.content", textContent);
			boolean(value.display, source, line, "entry.display");
			break;
		case "label":
			required.push("targetId");
			optional = ["label"];
			keys(value, required, optional, source, line, "entry");
			entryBase(value, source, line);
			string(value.targetId, source, line, "entry.targetId");
			if (!isEntryId(value.targetId as string)) fail(source, line, "entry.targetId must be an entry id");
			optionalString(value, "label", source, line, "entry");
			break;
		case "session_info":
			optional = ["name"];
			keys(value, required, optional, source, line, "entry");
			entryBase(value, source, line);
			optionalString(value, "name", source, line, "entry");
			break;
		default:
			fail(source, line, `entry.type "${type}" is not supported`);
	}

	return value as unknown as SessionEntry;
}

export function decodeHeader(value: unknown, source = "<session>", line = 1): SessionHeader {
	const header = object(value, source, line, "header");
	keys(header, ["type", "version", "id", "timestamp", "cwd"], [], source, line, "header");
	if (header.type !== "session") fail(source, line, "first entry must be a session header");
	if (header.version !== SESSION_VERSION) {
		fail(source, line, `session version ${String(header.version)} is unsupported; expected ${SESSION_VERSION}`);
	}
	const id = string(header.id, source, line, "header.id");
	try {
		assertPiSessionId(id);
	} catch (error) {
		fail(source, line, error instanceof Error ? error.message : String(error));
	}
	timestamp(header.timestamp, source, line, "header.timestamp");
	const cwd = string(header.cwd, source, line, "header.cwd");
	if (!isAbsolute(cwd)) fail(source, line, "header.cwd must be an absolute path");
	return header as unknown as SessionHeader;
}

function decodeLine(lineText: string, source: string, line: number): FileEntry {
	let value: unknown;
	try {
		value = JSON.parse(lineText) as unknown;
	} catch {
		fail(source, line, "line is not valid JSON");
	}
	const entry = object(value, source, line, "entry");
	return entry.type === "session" ? decodeHeader(entry, source, line) : decodeEntry(entry, source, line);
}

function validateTree(entries: readonly SessionEntry[], source: string): void {
	const ids = new Set<string>();
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		const line = index + 2;
		if (ids.has(entry.id)) fail(source, line, `duplicate entry id "${entry.id}"`);
		if (entry.parentId !== null && !ids.has(entry.parentId)) {
			fail(source, line, `parent entry "${entry.parentId}" must appear before its child`);
		}
		if (entry.type === "compaction" && !ids.has(entry.firstKeptEntryId)) {
			fail(source, line, `first kept entry "${entry.firstKeptEntryId}" must appear before the compaction`);
		}
		if (entry.type === "branch_summary" && entry.fromId !== "root" && !ids.has(entry.fromId)) {
			fail(source, line, `source entry "${entry.fromId}" must appear before the branch summary`);
		}
		if (entry.type === "label" && !ids.has(entry.targetId)) {
			fail(source, line, `label target "${entry.targetId}" must appear before the label`);
		}
		ids.add(entry.id);
	}
}

export function decodeSession(content: string, source = "<session>"): FileEntry[] {
	const lines = content.split("\n");
	if (lines.at(-1) === "") lines.pop();
	if (lines.length === 0) throw new SessionFormatError(source, "session is empty");
	const entries = lines.map((lineText, index) => {
		if (lineText.length === 0) fail(source, index + 1, "blank lines are not allowed");
		return decodeLine(lineText, source, index + 1);
	});
	const header = entries[0];
	if (header.type !== "session") fail(source, 1, "first entry must be a session header");
	for (let index = 1; index < entries.length; index++) {
		if (entries[index].type === "session")
			fail(source, index + 1, "session header may only appear on the first line");
	}
	validateTree(entries.slice(1) as SessionEntry[], source);
	return entries;
}
