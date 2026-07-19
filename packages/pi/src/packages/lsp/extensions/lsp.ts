import type { ExtensionAPI } from "@tsuuanmi/pi/api/types";
import { createLspToolDefinition } from "#lsp/tools/lsp-tool";

export default function lspExtension(pi: ExtensionAPI): void {
	pi.registerTool(createLspToolDefinition(process.cwd()));
}
