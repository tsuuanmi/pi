import type { CompactionSummaryMessage } from "@tsuuanmi/pi-agent";
import { CollapsibleMessage, getMarkdownTheme, keyText, theme } from "@tsuuanmi/pi-tui";

/**
 * Component that renders a compaction summary message with collapsed/expanded state.
 */
export class CompactionSummaryMessageComponent extends CollapsibleMessage {
	constructor(message: CompactionSummaryMessage, markdownTheme = getMarkdownTheme()) {
		const tokenStr = message.tokensBefore.toLocaleString();
		super({
			label: theme.fg("customMessageLabel", `\x1b[1m[compaction]\x1b[22m`),
			collapsedText:
				theme.fg("customMessageText", `Compacted from ${tokenStr} tokens (`) +
				theme.fg("dim", keyText("app.tools.expand")) +
				theme.fg("customMessageText", " to expand)"),
			expandedHeaderMarkdown: `**Compacted from ${tokenStr} tokens**\n\n`,
			expandedBodyMarkdown: message.summary,
			markdownTheme,
		});
	}
}
