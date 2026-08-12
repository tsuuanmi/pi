import type { ExtensionAPI, ExtensionToolSpec } from "@tsuuanmi/pi/extensions";

export function captureTools(
	register: (host: Pick<ExtensionAPI, "registerTool">) => void,
): Map<string, ExtensionToolSpec> {
	const tools = new Map<string, ExtensionToolSpec>();
	register({ registerTool: (tool) => tools.set(tool.name, tool) });
	return tools;
}
