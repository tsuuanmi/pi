import { createHash } from "node:crypto";
import { InternetError } from "#internet/core/errors";

const TURN_METADATA_KEY = "x-codex-turn-metadata";

export interface ChatGptWebRequestContext {
	cwd: string;
	sessionId: string;
	turnId: string;
}

export function rejectedChatGptWebRequest(): Record<string, unknown> {
	return { model: "chatgpt-web/__request-rejected__", input: [], stream: true, store: false };
}

export function adaptChatGptWebRequest(payload: unknown, context: ChatGptWebRequestContext): unknown {
	if (!isRecord(payload) || !Array.isArray(payload.input)) throw invalidRequest("request payload");
	if (!context.sessionId || !context.turnId) throw invalidRequest("session turn identity");
	if (!context.cwd.startsWith("/") || /[<>&\u0000-\u001f]/.test(context.cwd))
		throw invalidRequest("absolute XML-safe working directory");

	const threadId = stableId("thread", context.sessionId);
	const turnId = stableId("turn", `${context.sessionId}\0${context.turnId}`);
	const input = normalizeInput(payload.input, context.cwd, turnId);
	const userIndex = findActiveUserIndex(input);
	if (userIndex < 0) throw invalidRequest("current user message");
	const currentUser = input[userIndex];
	if (!isRecord(currentUser)) throw invalidRequest("current user message");
	const environment = environmentMessage(context.cwd, turnId);
	const canonicalUser = { ...currentUser, type: "message" };
	const user = {
		...canonicalUser,
		id: stableId("user", `${turnId}\0${stableJson(canonicalUser)}`),
	};
	input.splice(userIndex, 1, environment, user);

	return {
		...payload,
		input,
		prompt_cache_key: threadId,
		client_metadata: {
			...(isRecord(payload.client_metadata) ? payload.client_metadata : {}),
			[TURN_METADATA_KEY]: JSON.stringify({
				thread_id: threadId,
				turn_id: turnId,
				sandbox: "read-only",
				workspaces: { [context.cwd]: { git: null } },
			}),
		},
	};
}

function normalizeInput(input: unknown[], cwd: string, turnId: string): unknown[] {
	const normalized = input.slice();
	const userIndex = findActiveUserIndex(normalized);
	if (userIndex < 1) return normalized;
	const environment = normalized[userIndex - 1];
	const user = normalized[userIndex];
	if (!isRecord(environment) || !isRecord(user)) return normalized;

	const generated =
		typeof environment.id === "string" &&
		environment.id.startsWith("environment_") &&
		typeof user.id === "string" &&
		user.id.startsWith("user_");
	if (!generated) return normalized;

	const logicalUser = { ...user };
	delete logicalUser.id;
	const expectedEnvironment = environmentMessage(cwd, turnId);
	const expectedUserId = stableId("user", `${turnId}\0${stableJson(logicalUser)}`);
	if (stableJson(environment) !== stableJson(expectedEnvironment) || user.id !== expectedUserId)
		throw invalidRequest("existing ChatGPT Web turn metadata");
	normalized.splice(userIndex - 1, 2, logicalUser);
	return normalized;
}

function environmentMessage(cwd: string, turnId: string): Record<string, unknown> {
	const text = [
		"<environment_context>",
		`  <cwd>${cwd}</cwd>`,
		"  <sandbox_mode>read-only</sandbox_mode>",
		"  <network_access>enabled</network_access>",
		"</environment_context>",
	].join("\n");
	return {
		type: "message",
		role: "user",
		id: stableId("environment", `${turnId}\0${cwd}`),
		content: [{ type: "input_text", text }],
	};
}

function findActiveUserIndex(input: unknown[]): number {
	for (let index = input.length - 1; index >= 0; index -= 1) {
		const item = input[index];
		if (isRecord(item) && item.role === "user" && (item.type === undefined || item.type === "message")) return index;
	}
	return -1;
}

function stableId(prefix: string, value: string): string {
	return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function stableJson(value: unknown): string {
	return JSON.stringify(value, (_key, nested) => {
		if (!isRecord(nested)) return nested;
		return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)));
	});
}

function invalidRequest(part: string): InternetError {
	return new InternetError(`ChatGPT Web request is missing a valid ${part}.`, {
		code: "daemon_rejected",
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
