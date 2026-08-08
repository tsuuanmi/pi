import type { WebProviderModel } from "../../types.ts";

export interface ChatGptRoute extends WebProviderModel {
	effortIndex: number;
}

export const CHATGPT_ROUTES: readonly ChatGptRoute[] = [
	{
		id: "light",
		name: "ChatGPT Instant",
		contextWindow: 150_000,
		input: ["text", "image", "file"],
		output: ["text", "reasoning", "tool"],
		effortIndex: 0,
	},
	{
		id: "medium",
		name: "ChatGPT Medium",
		contextWindow: 150_000,
		input: ["text", "image", "file"],
		output: ["text", "reasoning", "tool"],
		effortIndex: 1,
	},
	{
		id: "high",
		name: "ChatGPT High",
		contextWindow: 185_000,
		input: ["text", "image", "file"],
		output: ["text", "reasoning", "tool"],
		effortIndex: 2,
	},
	{
		id: "extra-high",
		name: "ChatGPT Extra High",
		contextWindow: 256_000,
		input: ["text", "image", "file"],
		output: ["text", "reasoning", "tool"],
		effortIndex: 3,
	},
	{
		id: "pro",
		name: "ChatGPT Pro",
		contextWindow: 272_000,
		input: ["text", "image", "file"],
		output: ["text", "reasoning", "tool"],
		effortIndex: 4,
	},
];

export function getChatGptRoute(id: string): ChatGptRoute {
	const route = CHATGPT_ROUTES.find((candidate) => candidate.id === id);
	if (!route) throw new Error(`unsupported ChatGPT route: ${id}`);
	return route;
}
