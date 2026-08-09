import type { WebProviderDescriptor } from "../../types.ts";
import { CHATGPT_WEB_PROVIDER_ID, CHATGPT_WEB_PROVIDER_NAME } from "./constants.ts";
import { verifyChatGptLogin } from "./login.ts";
import { CHATGPT_ROUTES } from "./routes.ts";
import { runChatGptTurn } from "./turn.ts";

export const chatGptWebProvider: WebProviderDescriptor = {
	id: CHATGPT_WEB_PROVIDER_ID,
	name: CHATGPT_WEB_PROVIDER_NAME,
	models: CHATGPT_ROUTES,
	worker: "./worker",
	verify: verifyChatGptLogin,
	runTurn: runChatGptTurn,
};

export default chatGptWebProvider;
