import type { ExtensionAPI } from "../../../api/types.ts";
import { createLspToolDefinition } from "../tools/lsp-tool.ts";

export default function lspExtension(pi: ExtensionAPI): void {
	pi.registerTool(createLspToolDefinition(process.cwd()));
}
