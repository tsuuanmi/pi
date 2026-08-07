import type { ExtensionFactory } from "#pi/api/extension-types";
import builtinChatGptWebExtension from "#pi/extensions/chatgpt-web/extension";
import builtinWorkflowsExtension from "#pi/extensions/workflows";

export function getBuiltinExtensionFactories(): ExtensionFactory[] {
	return [builtinWorkflowsExtension, builtinChatGptWebExtension];
}
