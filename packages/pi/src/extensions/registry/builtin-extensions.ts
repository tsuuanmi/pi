import type { ExtensionFactory } from "#pi/api/extension-types";
import builtinWorkflowsExtension from "#pi/extensions/builtin-workflows";

export function getBuiltinExtensionFactories(): ExtensionFactory[] {
	return [builtinWorkflowsExtension];
}
