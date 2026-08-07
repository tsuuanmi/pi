import type { ExtensionFactory } from "#pi/api/extension-types";
import builtinChatGptWebExtension from "#pi/extensions/builtin-chatgpt-web";
import builtinWorkflowsExtension from "#pi/extensions/builtin-workflows";

export function getBuiltinExtensionFactories(): ExtensionFactory[] {
	return [builtinWorkflowsExtension, builtinChatGptWebExtension];
}
