import type { ExtensionAPI } from "#pi/api/extension-types";
import { registerChatGptWebProvider } from "#pi/extensions/chatgpt-web/provider";

export default function builtinChatGptWebExtension(pi: ExtensionAPI): void {
	registerChatGptWebProvider(pi);
}
