import type { ExtensionFactory } from "#pi/api/types";
import builtinWorkflowsExtension from "#pi/extensions/builtin-workflows";

export function getBuiltinExtensionFactories(): ExtensionFactory[] {
	return [builtinWorkflowsExtension];
}
