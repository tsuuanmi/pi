import { isValidThinkingLevel } from "@tsuuanmi/pi-agent";
import type { Settings } from "#pi/settings/types";

type JsonObject = Record<string, unknown>;

const SETTINGS_KEYS = new Set([
	"providers",
	"defaultProvider",
	"defaultModel",
	"defaultThinkingLevel",
	"agentModels",
	"agentThinkingLevels",
	"transport",
	"steeringMode",
	"followUpMode",
	"theme",
	"compaction",
	"branchSummary",
	"retry",
	"hideThinkingBlock",
	"shellPath",
	"shellCommandPrefix",
	"npmCommand",
	"packages",
	"extensions",
	"skills",
	"prompts",
	"themes",
	"commands",
	"enableSkillCommands",
	"enabledModels",
	"showHardwareCursor",
	"markdown",
	"apiUsageLogging",
	"retainedContext",
	"sessionDir",
	"httpProxy",
	"httpIdleTimeoutMs",
	"websocketConnectTimeoutMs",
	"statusLine",
]);
const TRANSPORTS = new Set(["sse", "websocket", "websocket-cached", "auto"]);
const MODES = new Set(["all", "one-at-a-time"]);
const STATUS_SEGMENTS = new Set([
	"model",
	"mode",
	"git",
	"path",
	"context_pct",
	"context_total",
	"token_in",
	"token_out",
	"session_name",
	"subagents",
]);

export class SettingsFormatError extends Error {
	constructor(path: string, message: string) {
		super(`${path}: ${message}`);
		this.name = "SettingsFormatError";
	}
}

function fail(path: string, message: string): never {
	throw new SettingsFormatError(path, message);
}

function object(value: unknown, path: string): JsonObject {
	if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
	return value as JsonObject;
}

function exact(value: JsonObject, allowed: readonly string[], path: string): void {
	const keys = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!keys.has(key)) fail(`${path}.${key}`, "is not supported");
	}
}

function string(value: unknown, path: string, allowEmpty = false): string {
	if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
		fail(path, `must be ${allowEmpty ? "a string" : "a non-empty string"}`);
	}
	return value;
}

function boolean(value: unknown, path: string): void {
	if (typeof value !== "boolean") fail(path, "must be a boolean");
}

function number(value: unknown, path: string, integer = false): void {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
		fail(path, `must be a non-negative ${integer ? "integer" : "number"}`);
	}
}

function strings(value: unknown, path: string): void {
	if (!Array.isArray(value)) fail(path, "must be an array");
	value.forEach((item, index) => {
		string(item, `${path}[${index}]`);
	});
}

function stringMap(value: unknown, path: string): void {
	for (const [key, item] of Object.entries(object(value, path))) {
		string(key, `${path} key`);
		string(item, `${path}.${key}`);
	}
}

function thinkingMap(value: unknown, path: string): void {
	for (const [key, item] of Object.entries(object(value, path))) {
		string(key, `${path} key`);
		if (typeof item !== "string" || !isValidThinkingLevel(item)) fail(`${path}.${key}`, "is not a thinking level");
	}
}

function provider(value: unknown, path: string): void {
	const providerValue = object(value, path);
	exact(
		providerValue,
		["name", "baseUrl", "apiKey", "api", "headers", "compat", "authHeader", "models", "modelOverrides"],
		path,
	);
	for (const key of ["name", "baseUrl", "apiKey", "api"] as const) {
		if (key in providerValue) string(providerValue[key], `${path}.${key}`);
	}
	if ("authHeader" in providerValue) boolean(providerValue.authHeader, `${path}.authHeader`);
	if ("headers" in providerValue) stringMap(providerValue.headers, `${path}.headers`);
	if ("compat" in providerValue) object(providerValue.compat, `${path}.compat`);
	if ("modelOverrides" in providerValue) {
		for (const [id, override] of Object.entries(object(providerValue.modelOverrides, `${path}.modelOverrides`))) {
			string(id, `${path}.modelOverrides key`);
			object(override, `${path}.modelOverrides.${id}`);
		}
	}
	if ("models" in providerValue) {
		if (!Array.isArray(providerValue.models)) fail(`${path}.models`, "must be an array");
		providerValue.models.forEach((model, index) => {
			const modelValue = object(model, `${path}.models[${index}]`);
			string(modelValue.id, `${path}.models[${index}].id`);
		});
	}
}

function providers(value: unknown, path: string): void {
	for (const [id, config] of Object.entries(object(value, path))) {
		string(id, `${path} key`);
		provider(config, `${path}.${id}`);
	}
}

function packages(value: unknown, path: string): void {
	if (!Array.isArray(value)) fail(path, "must be an array");
	value.forEach((entry, index) => {
		const itemPath = `${path}[${index}]`;
		if (typeof entry === "string") {
			string(entry, itemPath);
			return;
		}
		const packageValue = object(entry, itemPath);
		exact(packageValue, ["source", "extensions", "skills", "prompts", "themes", "commands", "agents"], itemPath);
		string(packageValue.source, `${itemPath}.source`);
		for (const key of ["extensions", "skills", "prompts", "themes", "commands", "agents"] as const) {
			if (key in packageValue) strings(packageValue[key], `${itemPath}.${key}`);
		}
	});
}

function retry(value: unknown, path: string): void {
	const retryValue = object(value, path);
	exact(retryValue, ["enabled", "maxRetries", "baseDelayMs", "provider"], path);
	if ("enabled" in retryValue) boolean(retryValue.enabled, `${path}.enabled`);
	if ("maxRetries" in retryValue) number(retryValue.maxRetries, `${path}.maxRetries`, true);
	if ("baseDelayMs" in retryValue) number(retryValue.baseDelayMs, `${path}.baseDelayMs`);
	if ("provider" in retryValue) {
		const providerValue = object(retryValue.provider, `${path}.provider`);
		exact(providerValue, ["timeoutMs", "maxRetries", "maxRetryDelayMs"], `${path}.provider`);
		if ("timeoutMs" in providerValue) number(providerValue.timeoutMs, `${path}.provider.timeoutMs`);
		if ("maxRetries" in providerValue) number(providerValue.maxRetries, `${path}.provider.maxRetries`, true);
		if ("maxRetryDelayMs" in providerValue) number(providerValue.maxRetryDelayMs, `${path}.provider.maxRetryDelayMs`);
	}
}

function statusLine(value: unknown, path: string): void {
	const status = object(value, path);
	exact(status, ["preset", "leftSegments", "rightSegments", "separator", "segmentOptions", "showHud"], path);
	if ("preset" in status && status.preset !== "default" && status.preset !== "custom") {
		fail(`${path}.preset`, 'must be "default" or "custom"');
	}
	for (const key of ["leftSegments", "rightSegments"] as const) {
		if (!(key in status)) continue;
		if (!Array.isArray(status[key])) fail(`${path}.${key}`, "must be an array");
		status[key].forEach((segment, index) => {
			if (typeof segment !== "string" || !STATUS_SEGMENTS.has(segment)) {
				fail(`${path}.${key}[${index}]`, "is not a status segment");
			}
		});
	}
	if ("separator" in status && status.separator !== "slash") fail(`${path}.separator`, 'must be "slash"');
	if ("showHud" in status) boolean(status.showHud, `${path}.showHud`);
	if (!("segmentOptions" in status)) return;
	const options = object(status.segmentOptions, `${path}.segmentOptions`);
	exact(options, ["model", "path", "git"], `${path}.segmentOptions`);
	if ("model" in options) {
		const model = object(options.model, `${path}.segmentOptions.model`);
		exact(model, ["showThinkingLevel", "showProviderPrefix"], `${path}.segmentOptions.model`);
		for (const key of Object.keys(model)) boolean(model[key], `${path}.segmentOptions.model.${key}`);
	}
	if ("path" in options) {
		const pathOptions = object(options.path, `${path}.segmentOptions.path`);
		exact(pathOptions, ["abbreviate", "maxLength", "stripWorkPrefix"], `${path}.segmentOptions.path`);
		if ("abbreviate" in pathOptions) boolean(pathOptions.abbreviate, `${path}.segmentOptions.path.abbreviate`);
		if ("maxLength" in pathOptions) number(pathOptions.maxLength, `${path}.segmentOptions.path.maxLength`, true);
		if ("stripWorkPrefix" in pathOptions) boolean(pathOptions.stripWorkPrefix, `${path}.segmentOptions.path.stripWorkPrefix`);
	}
	if ("git" in options) {
		const git = object(options.git, `${path}.segmentOptions.git`);
		exact(git, ["showBranch", "showStaged", "showUnstaged", "showUntracked"], `${path}.segmentOptions.git`);
		for (const key of Object.keys(git)) boolean(git[key], `${path}.segmentOptions.git.${key}`);
	}
}

function validate(settings: JsonObject, path: string): void {
	for (const key of Object.keys(settings)) {
		if (!SETTINGS_KEYS.has(key)) fail(`${path}.${key}`, "is not supported");
	}
	if ("providers" in settings) providers(settings.providers, `${path}.providers`);
	for (const key of ["defaultProvider", "defaultModel", "theme", "shellPath", "shellCommandPrefix", "sessionDir", "httpProxy"] as const) {
		if (key in settings) string(settings[key], `${path}.${key}`);
	}
	if ("defaultThinkingLevel" in settings) {
		if (typeof settings.defaultThinkingLevel !== "string" || !isValidThinkingLevel(settings.defaultThinkingLevel)) {
			fail(`${path}.defaultThinkingLevel`, "is not a thinking level");
		}
	}
	if ("agentModels" in settings) stringMap(settings.agentModels, `${path}.agentModels`);
	if ("agentThinkingLevels" in settings) thinkingMap(settings.agentThinkingLevels, `${path}.agentThinkingLevels`);
	if ("transport" in settings && (typeof settings.transport !== "string" || !TRANSPORTS.has(settings.transport))) {
		fail(`${path}.transport`, "is not a transport");
	}
	for (const key of ["steeringMode", "followUpMode"] as const) {
		if (key in settings && (typeof settings[key] !== "string" || !MODES.has(settings[key]))) fail(`${path}.${key}`, "is not a mode");
	}
	for (const [key, allowed, numeric] of [
		["compaction", ["enabled", "reserveTokens", "keepRecentTokens"], ["reserveTokens", "keepRecentTokens"]],
		["branchSummary", ["reserveTokens", "skipPrompt"], ["reserveTokens"]],
		["retainedContext", ["stripThinking", "compressBashOutput", "bashMaxBytes", "dedupeReadResults", "summarizeStaleToolResults", "toolResultMaxBytes"], ["bashMaxBytes", "toolResultMaxBytes"]],
	] as const) {
		if (!(key in settings)) continue;
		const value = object(settings[key], `${path}.${key}`);
		exact(value, allowed, `${path}.${key}`);
		for (const field of Object.keys(value)) {
			if ((numeric as readonly string[]).includes(field)) number(value[field], `${path}.${key}.${field}`);
			else boolean(value[field], `${path}.${key}.${field}`);
		}
	}
	if ("retry" in settings) retry(settings.retry, `${path}.retry`);
	for (const key of ["hideThinkingBlock", "enableSkillCommands", "showHardwareCursor"] as const) {
		if (key in settings) boolean(settings[key], `${path}.${key}`);
	}
	if ("npmCommand" in settings) strings(settings.npmCommand, `${path}.npmCommand`);
	if ("packages" in settings) packages(settings.packages, `${path}.packages`);
	for (const key of ["extensions", "skills", "prompts", "themes", "commands", "enabledModels"] as const) {
		if (key in settings) strings(settings[key], `${path}.${key}`);
	}
	if ("markdown" in settings) {
		const markdown = object(settings.markdown, `${path}.markdown`);
		exact(markdown, ["codeBlockIndent"], `${path}.markdown`);
		if ("codeBlockIndent" in markdown) string(markdown.codeBlockIndent, `${path}.markdown.codeBlockIndent`, true);
	}
	if ("apiUsageLogging" in settings) {
		const logging = object(settings.apiUsageLogging, `${path}.apiUsageLogging`);
		exact(logging, ["enabled"], `${path}.apiUsageLogging`);
		if ("enabled" in logging) boolean(logging.enabled, `${path}.apiUsageLogging.enabled`);
	}
	for (const key of ["httpIdleTimeoutMs", "websocketConnectTimeoutMs"] as const) {
		if (key in settings) number(settings[key], `${path}.${key}`);
	}
	if ("statusLine" in settings) statusLine(settings.statusLine, `${path}.statusLine`);
}

export function parseSettings(content: string, source = "settings"): Settings {
	let value: unknown;
	try {
		value = JSON.parse(content) as unknown;
	} catch {
		throw new SettingsFormatError(source, "is not valid JSON");
	}
	const settings = object(value, source);
	validate(settings, source);
	return settings as Settings;
}

export function serializeSettings(settings: Settings): string {
	validate(settings as JsonObject, "settings");
	return `${JSON.stringify(settings, null, 2)}\n`;
}
