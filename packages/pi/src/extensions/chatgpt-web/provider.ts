import type { Api, Context, Model, StreamOptions } from "@tsuuanmi/pi-ai";
import { streamOpenAIResponses } from "@tsuuanmi/pi-ai/openai-responses";
import type { ExtensionAPI } from "#pi/api/extension-types";
import {
	CHATGPT_WEB_BASE_URL_ENV,
	CHATGPT_WEB_MODELS,
	CHATGPT_WEB_PROVIDER,
	CHATGPT_WEB_ROUTE_PREFIX,
} from "#pi/extensions/chatgpt-web/models";

const LOCAL_API_KEY = "local";

function readBaseUrl(): string | undefined {
	const value = process.env[CHATGPT_WEB_BASE_URL_ENV]?.trim();
	if (!value) return undefined;

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${CHATGPT_WEB_BASE_URL_ENV} must be an absolute URL ending in /v1`);
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`${CHATGPT_WEB_BASE_URL_ENV} must use http or https`);
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new Error(`${CHATGPT_WEB_BASE_URL_ENV} must not contain credentials, a query, or a fragment`);
	}

	const pathname = url.pathname.replace(/\/+$/, "");
	if (!pathname.endsWith("/v1")) {
		throw new Error(`${CHATGPT_WEB_BASE_URL_ENV} must end in /v1`);
	}
	url.pathname = pathname;
	return url.toString();
}

function streamChatGptWeb(model: Model<Api>, context: Context, options?: StreamOptions) {
	if (model.api !== "openai-responses") {
		throw new Error(`ChatGPT Web provider received unsupported API: ${model.api}`);
	}

	const responseModel = {
		...model,
		id: `${CHATGPT_WEB_ROUTE_PREFIX}${model.id}`,
	} as Model<"openai-responses">;
	return streamOpenAIResponses(responseModel, context, { ...options, apiKey: LOCAL_API_KEY });
}

export function registerChatGptWebProvider(pi: ExtensionAPI): void {
	const baseUrl = readBaseUrl();
	if (!baseUrl) return;

	pi.registerProvider(CHATGPT_WEB_PROVIDER, {
		name: "ChatGPT Web",
		baseUrl,
		apiKey: LOCAL_API_KEY,
		api: "openai-responses",
		models: CHATGPT_WEB_MODELS,
		stream: streamChatGptWeb,
	});
}
