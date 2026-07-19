import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderHudBar, type StatusLineHudEntry } from "#tui/index";

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
		assert.equal(renderHudBar([entry({ id: "agent", active: false })], 80), null);
	});

	it("renders the active id and phase compactly", () => {
		const rendered = renderHudBar([entry({ id: "agent", phase: "running" })], 80);
		assert.notEqual(rendered, null);
		const plain = stripAnsiLocal(rendered ?? "");
		assert.match(plain, new RegExp(escapeRegExp(String("hud"))));
		assert.match(plain, new RegExp(escapeRegExp(String("agent:running"))));
	});

	it("sanitizes newline/tab and ANSI escapes in id/phase", () => {
		const rendered = renderHudBar([entry({ id: "agent\n\x1b[31mred", phase: "running\twith phase" })], 80);
		assert.notEqual(rendered, null);
		const plain = stripAnsiLocal(rendered ?? "");
		assert.doesNotMatch(plain, new RegExp(escapeRegExp(String("\n"))));
		assert.doesNotMatch(plain, new RegExp(escapeRegExp(String("\t"))));
	});

	it("truncates the bar to the available width", () => {
		const rendered = renderHudBar([entry({ id: "agent", phase: "running-with-a-very-very-long-phase-name" })], 30);
		assert.notEqual(rendered, null);
		assert.ok(visibleWidth(rendered ?? "") <= 30);
	});

	it("emits a warn:stale chip when the entry is stale", () => {
		const rendered = stripAnsiLocal(
			renderHudBar([entry({ id: "planner", phase: "planning", stale: true })], 120) ?? "",
		);
		assert.match(rendered, new RegExp(escapeRegExp(String("warn:stale"))));
	});

	it("sorts chips by priority and prefixes severity", () => {
		const rendered = stripAnsiLocal(
			renderHudBar(
				[
					entry({
						id: "planner",
						phase: "planning",
						hud: {
							chips: [
								{ label: "stage", value: "critic", priority: 10 },
								{ label: "verdict", value: "ITERATE", priority: 40, severity: "warning" },
							],
						},
					}),
				],
				120,
			) ?? "",
		);
		const stageIdx = rendered.indexOf("stage=critic");
		const verdictIdx = rendered.indexOf("warn:verdict=ITERATE");
		assert.ok(stageIdx > -1);
		assert.ok(verdictIdx > stageIdx);
		assert.match(rendered, new RegExp(escapeRegExp(String("warn:verdict=ITERATE"))));
	});

	it("renders multiple entries joined by +", () => {
		const rendered = stripAnsiLocal(
			renderHudBar([entry({ id: "agent", phase: "running" }), entry({ id: "review", phase: "active" })], 120) ?? "",
		);
		assert.match(rendered, new RegExp(escapeRegExp(String("agent:running"))));
		assert.match(rendered, new RegExp(escapeRegExp(String("review:active"))));
		assert.match(rendered, new RegExp(escapeRegExp(String("+"))));
	});
});
