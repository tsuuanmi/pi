import { Markdown, type MarkdownTheme } from "#tui/components/display/markdown";
import { Text } from "#tui/components/display/text";
import { Box } from "#tui/components/layout/box";
import { Spacer } from "#tui/components/layout/spacer";
import { theme } from "#tui/theme/theme";

export interface CollapsibleMessageOptions {
	label: string;
	collapsedText: string;
	expandedHeaderMarkdown: string;
	expandedBodyMarkdown: string;
	markdownTheme: MarkdownTheme;
	backgroundFn?: (text: string) => string;
}

/**
 * Generic collapsible markdown message block.
 */
export class CollapsibleMessage extends Box {
	private expanded = false;
	private options: CollapsibleMessageOptions;

	constructor(options: CollapsibleMessageOptions) {
		super(1, 1, options.backgroundFn ?? ((text: string) => theme.bg("customMessageBg", text)));
		this.options = options;
		this.updateDisplay();
	}

	setExpanded(expanded: boolean): void {
		if (this.expanded === expanded) return;
		this.expanded = expanded;
		this.updateDisplay();
	}

	setOptions(options: CollapsibleMessageOptions): void {
		this.options = options;
		this.updateDisplay();
	}

	override invalidate(): void {
		super.invalidate();
		this.updateDisplay();
	}

	private updateDisplay(): void {
		this.clear();

		const label = theme.fg("customMessageLabel", this.options.label);
		this.addChild(new Text(label, 0, 0));
		this.addChild(new Spacer(1));

		if (this.expanded) {
			this.addChild(
				new Markdown(
					this.options.expandedHeaderMarkdown + this.options.expandedBodyMarkdown,
					0,
					0,
					this.options.markdownTheme,
					{
						color: (text: string) => theme.fg("customMessageText", text),
					},
				),
			);
		} else {
			this.addChild(new Text(theme.fg("customMessageText", this.options.collapsedText), 0, 0));
		}
	}
}
