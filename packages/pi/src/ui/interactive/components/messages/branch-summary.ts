import type { BranchSummaryMessage } from "@tsuuanmi/pi-agent";
import { CollapsibleMessage, getMarkdownTheme, theme } from "@tsuuanmi/pi-tui";

/**
 * Component that renders a branch summary message with collapsed/expanded state.
 */
export class BranchSummaryMessageComponent extends CollapsibleMessage {
	constructor(message: BranchSummaryMessage, markdownTheme = getMarkdownTheme()) {
		super({
			label: theme.fg("customMessageLabel", `\x1b[1m[branch]\x1b[22m`),
			collapsedText: theme.fg("customMessageText", "Branch summary (expand for details)"),
			expandedHeaderMarkdown: "**Branch Summary**\n\n",
			expandedBodyMarkdown: message.summary,
			markdownTheme,
		});
	}
}
