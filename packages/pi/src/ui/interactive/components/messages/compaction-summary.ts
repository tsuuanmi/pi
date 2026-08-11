import type { CompactionSummaryMessage } from "@tsuuanmi/pi-agent";
import { CollapsibleMessage, getMarkdownTheme, theme } from "@tsuuanmi/pi-tui";

/**
 * Component that renders a compaction summary message with collapsed/expanded state.
 */
export class CompactionSummaryMessageComponent extends CollapsibleMessage {
	constructor(message: CompactionSummaryMessage, markdownTheme = getMarkdownTheme()) {
		const tokenStr = message.tokensBefore.toLocaleString();
		super({
			label: theme.fg("customMessageLabel", `\x1b[1m[compaction]\x1b[22m`),
			collapsedText: theme.fg("customMessageText", `Compacted from ${tokenStr} tokens (expand for details)`),
			expandedHeaderMarkdown: `**Compacted from ${tokenStr} tokens**\n\n`,
			expandedBodyMarkdown: message.summary,
			markdownTheme,
		});
	}
}
