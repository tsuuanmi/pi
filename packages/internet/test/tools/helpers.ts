import type { InternetToolHost } from "#internet/tool/host";
import type { InternetToolSpec } from "#internet/tool/spec";

export function captureTools(register: (host: InternetToolHost) => void): Map<string, InternetToolSpec> {
	const tools = new Map<string, InternetToolSpec>();
	register({ registerTool: (tool) => tools.set(tool.name, tool) });
	return tools;
}
