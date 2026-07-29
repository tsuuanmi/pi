import { Text } from "#tui/components/display/text";

/** Interface for components that can be expanded/collapsed */
export interface Expandable {
	setExpanded(expanded: boolean): void;
}

/**
 * Text component whose collapsed/expanded content is produced lazily by callbacks.
 * Extracted from InteractiveMode so the resource-display controller can construct it
 * without a circular import. The host still uses `isExpandable` (kept inline) for
 * duck-typing arbitrary header components.
 */
export class ExpandableText extends Text implements Expandable {
	private readonly getCollapsedText: () => string;
	private readonly getExpandedText: () => string;

	constructor(
		getCollapsedText: () => string,
		getExpandedText: () => string,
		expanded = false,
		paddingX = 0,
		paddingY = 0,
	) {
		super(expanded ? getExpandedText() : getCollapsedText(), paddingX, paddingY);
		this.getCollapsedText = getCollapsedText;
		this.getExpandedText = getExpandedText;
	}

	setExpanded(expanded: boolean): void {
		this.setText(expanded ? this.getExpandedText() : this.getCollapsedText());
	}
}
