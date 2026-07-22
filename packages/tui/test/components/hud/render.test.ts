import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { HUD_COLOR_PROFILE, initTheme, renderHudBar, type StatusLineHudEntry, theme } from "#tui/index";

before(() => {
	initTheme("dark");
});

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
function stripAnsiLocal(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}
function visibleWidth(text: string): number {
	return stripAnsiLocal(text).length;
}

function entry(overrides: Partial<StatusLineHudEntry> & { id: StatusLineHudEntry["id"] }): StatusLineHudEntry {
	return { active: true, phase: "running", updated_at: new Date().toISOString(), ...overrides };
}

describe("renderHudBar", () => {
	it("returns null when there are no active entries", () => {
		assert.equal(renderHudBar([], 80), null);
	});

	it("returns null when all entries are inactive", () => {
		assert.equal(renderHudBar([entry({ id: "source", active: false })], 80), null);
	});

	it("renders the active id compactly without a literal hud prefix or special phase display", () => {
		const rendered = renderHudBar([entry({ id: "source", phase: "running" })], 80);
		assert.notEqual(rendered, null);
		const plain = stripAnsiLocal(rendered ?? "");
		assert.equal(plain.startsWith("◆ hud "), false);
		assert.match(plain, new RegExp(escapeRegExp(String("source"))));
		assert.doesNotMatch(plain, new RegExp(escapeRegExp(String("source:running"))));
	});

	it("sanitizes newline/tab and ANSI escapes in entry fields", () => {
		const rendered = renderHudBar([entry({ id: "source\n\x1b[31mred", phase: "running\twith phase" })], 80);
		assert.notEqual(rendered, null);
		const plain = stripAnsiLocal(rendered ?? "");
		assert.doesNotMatch(plain, new RegExp(escapeRegExp(String("\n"))));
		assert.doesNotMatch(plain, new RegExp(escapeRegExp(String("\t"))));
	});

	it("truncates the bar to the available width", () => {
		const rendered = renderHudBar([entry({ id: "source-with-a-very-very-long-name", phase: "running" })], 30);
		assert.notEqual(rendered, null);
		assert.ok(visibleWidth(rendered ?? "") <= 30);
	});

	it("emits a warn:stale chip when the entry is stale", () => {
		const rendered = stripAnsiLocal(
			renderHudBar([entry({ id: "source", phase: "running", stale: true })], 120) ?? "",
		);
		assert.match(rendered, new RegExp(escapeRegExp(String("warn:stale"))));
	});

	it("sorts chips by priority and prefixes severity", () => {
		const rendered = stripAnsiLocal(
			renderHudBar(
				[
					entry({
						id: "source",
						phase: "running",
						hud: {
							version: 1,
							chips: [
								{ label: "status", value: "active", priority: 10 },
								{ label: "health", value: "slow", priority: 40, severity: "warning" },
							],
						},
					}),
				],
				120,
			) ?? "",
		);
		const statusIdx = rendered.indexOf("status=active");
		const healthIdx = rendered.indexOf("warn:health=slow");
		assert.ok(statusIdx > -1);
		assert.ok(healthIdx > statusIdx);
		assert.match(rendered, new RegExp(escapeRegExp(String("warn:health=slow"))));
	});

	it("styles the entry id and chip values with theme colors", () => {
		const rendered = renderHudBar(
			[
				entry({
					id: "source",
					phase: "running",
					hud: { version: 1, chips: [{ label: "load", value: "70%", priority: 10, severity: "warning" }] },
				}),
			],
			120,
		);
		assert.notEqual(rendered, null);
		assert.match(rendered ?? "", new RegExp(escapeRegExp(theme.getFgAnsi(HUD_COLOR_PROFILE.base))));
		assert.match(rendered ?? "", new RegExp(escapeRegExp(theme.getFgAnsi(HUD_COLOR_PROFILE.label))));
		assert.match(rendered ?? "", new RegExp(escapeRegExp(theme.getFgAnsi(HUD_COLOR_PROFILE.severity.warning))));
		assert.doesNotMatch(stripAnsiLocal(rendered ?? ""), new RegExp(escapeRegExp(String("source:running"))));
	});

	it("renders multiple entries joined by +", () => {
		const rendered = stripAnsiLocal(
			renderHudBar([entry({ id: "alpha", phase: "running" }), entry({ id: "beta", phase: "active" })], 120) ?? "",
		);
		assert.match(rendered, new RegExp(escapeRegExp(String("alpha"))));
		assert.match(rendered, new RegExp(escapeRegExp(String("beta"))));
		assert.doesNotMatch(rendered, new RegExp(escapeRegExp(String("alpha:running"))));
		assert.doesNotMatch(rendered, new RegExp(escapeRegExp(String("beta:active"))));
		assert.match(rendered, new RegExp(escapeRegExp(String("+"))));
	});
});
