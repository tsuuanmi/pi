import type { ExtensionAPI } from "../../../api/types.ts";

export default function providersExtension(_pi: ExtensionAPI): void {
	// Provider-specific coding-agent integrations live here.
	// OpenAI Codex usage primitives are owned by @tsuuanmi/pi-ai; footer wiring
	// still uses core interactive hooks until extension footer refresh hooks exist.
}
