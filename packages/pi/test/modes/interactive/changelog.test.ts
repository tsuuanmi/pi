import { describe, expect, it } from "vitest";
import { normalizeChangelogLinks } from "#pi/ui/interactive/utils/changelog";

describe("changelog links", () => {
	it.each([
		"https://github.com/badlogic/pi-mono/issues/1",
		"https://github.com/tsuuanmi/pi-mono/blob/main/packages/pi/README.md",
	])("leaves legacy repository links unchanged: %s", (target) => {
		const markdown = `[link](${target})`;

		expect(normalizeChangelogLinks(markdown, "1.2.3")).toBe(markdown);
	});

	it("normalizes current repository floating links to the release tag", () => {
		const markdown = "[link](https://github.com/tsuuanmi/pi/blob/main/packages/pi/README.md)";

		expect(normalizeChangelogLinks(markdown, "1.2.3")).toBe(
			"[link](https://github.com/tsuuanmi/pi/blob/v1.2.3/packages/pi/README.md)",
		);
	});
});
