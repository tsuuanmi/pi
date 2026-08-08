import type { WebProviderDescriptor } from "../../types.ts";
import { verifyChatGptLogin } from "./login.ts";
import { CHATGPT_ROUTES } from "./routes.ts";
import { runChatGptTurn } from "./turn.ts";

export const chatGptWebProvider: WebProviderDescriptor = {
	id: "chatgpt-web",
	name: "ChatGPT Web",
	models: CHATGPT_ROUTES,
	worker: "./worker",
	verify: verifyChatGptLogin,
	runTurn: runChatGptTurn,
};

export default chatGptWebProvider;
