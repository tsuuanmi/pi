import type { AssistantMessage } from "@tsuuanmi/pi-ai";

export function textOf(message: AssistantMessage): string {
	return message.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("\n");
}
