import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collapsePlanningPipeline, renderHudBar, type StatusLineWorkflowEntry } from "#tui/index";

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

function entry(
	overrides: Partial<StatusLineWorkflowEntry> & { skill: StatusLineWorkflowEntry["skill"] },
): StatusLineWorkflowEntry {
	return { active: true, phase: "running", updated_at: new Date().toISOString(), ...overrides };
}

describe("renderHudBar", () => {
	it("returns null when there are no active skills", () => {
		assert.equal(renderHudBar([], 80), null);
	});

	it("returns null when all entries are inactive", () => {
		assert.equal(renderHudBar([entry({ skill: "team", active: false })], 80), null);
	});

	it("renders the active skill and phase compactly", () => {
		const rendered = renderHudBar([entry({ skill: "team", phase: "running" })], 80);
		assert.notEqual(rendered, null);
		const plain = stripAnsiLocal(rendered ?? "");
		assert.match(plain, new RegExp(escapeRegExp(String("hud"))));
		assert.match(plain, new RegExp(escapeRegExp(String("team:running"))));
	});

	it("sanitizes newline/tab and ANSI escapes in skill/phase", () => {
		const rendered = renderHudBar([entry({ skill: "team\n\x1b[31mred" as never, phase: "running\twith phase" })], 80);
		assert.notEqual(rendered, null);
		const plain = stripAnsiLocal(rendered ?? "");
		assert.doesNotMatch(plain, new RegExp(escapeRegExp(String("\n"))));
		assert.doesNotMatch(plain, new RegExp(escapeRegExp(String("\t"))));
	});

	it("truncates the bar to the available width", () => {
		const rendered = renderHudBar([entry({ skill: "team", phase: "running-with-a-very-very-long-phase-name" })], 30);
		assert.notEqual(rendered, null);
		assert.ok(visibleWidth(rendered ?? "") <= 30);
	});

	it("emits a warn:stale chip when the entry is stale", () => {
		const rendered = stripAnsiLocal(
			renderHudBar([entry({ skill: "ralplan", phase: "planning", stale: true })], 120) ?? "",
		);
		assert.match(rendered, new RegExp(escapeRegExp(String("warn:stale"))));
	});

	it("sorts chips by priority and prefixes severity", () => {
		const rendered = stripAnsiLocal(
			renderHudBar(
				[
					entry({
						skill: "ralplan",
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
		// stage (priority 10) sorts before verdict (priority 40).
		const stageIdx = rendered.indexOf("stage=critic");
		const verdictIdx = rendered.indexOf("warn:verdict=ITERATE");
		assert.ok(stageIdx > -1);
		assert.ok(verdictIdx > stageIdx);
		assert.match(rendered, new RegExp(escapeRegExp(String("warn:verdict=ITERATE"))));
	});

	it("renders multiple non-pipeline skills joined by +", () => {
		const rendered = stripAnsiLocal(
			renderHudBar(
				[entry({ skill: "team", phase: "running" }), entry({ skill: "ultragoal", phase: "active" })],
				120,
			) ?? "",
		);
		// ultragoal is a pipeline skill; team is not. Both kept (only one
		// pipeline entry present, so no collapse).
		assert.match(rendered, new RegExp(escapeRegExp(String("team:running"))));
		assert.match(rendered, new RegExp(escapeRegExp(String("ultragoal:active"))));
		assert.match(rendered, new RegExp(escapeRegExp(String("+"))));
	});
});

describe("collapsePlanningPipeline", () => {
	it("keeps only the most recently updated pipeline skill", () => {
		const entries: StatusLineWorkflowEntry[] = [
			entry({ skill: "deep-interview", phase: "intent-first", updated_at: "2026-01-01T00:00:00.000Z" }),
			entry({ skill: "ralplan", phase: "planner", updated_at: "2026-01-02T00:00:00.000Z" }),
			entry({ skill: "ultragoal", phase: "active", updated_at: "2026-01-03T00:00:00.000Z" }),
		];
		const collapsed = collapsePlanningPipeline(entries);
		assert.equal(collapsed.length, 1);
		assert.equal(collapsed[0].skill, "ultragoal");
	});

	it("leaves non-pipeline skills untouched", () => {
		const entries: StatusLineWorkflowEntry[] = [
			entry({ skill: "team", phase: "running", updated_at: "2026-01-01T00:00:00.000Z" }),
			entry({ skill: "ralplan", phase: "planner", updated_at: "2026-01-02T00:00:00.000Z" }),
		];
		const collapsed = collapsePlanningPipeline(entries);
		assert.deepEqual(
			collapsed.map((e) => e.skill),
			["team", "ralplan"],
		);
	});

	it("is a passthrough for a single pipeline entry", () => {
		const entries: StatusLineWorkflowEntry[] = [entry({ skill: "ralplan", phase: "planner" })];
		assert.deepEqual(collapsePlanningPipeline(entries), entries);
	});
});

describe("renderHudBar — pipeline collapse integration", () => {
	it("renders only the latest pipeline skill after collapse", () => {
		const rendered = stripAnsiLocal(
			renderHudBar(
				[
					entry({ skill: "deep-interview", phase: "intent-first", updated_at: "2026-01-01T00:00:00.000Z" }),
					entry({ skill: "ralplan", phase: "planner", updated_at: "2026-01-02T00:00:00.000Z" }),
					entry({ skill: "ultragoal", phase: "active", updated_at: "2026-01-03T00:00:00.000Z" }),
				],
				120,
			) ?? "",
		);
		assert.match(rendered, new RegExp(escapeRegExp(String("ultragoal:active"))));
		assert.doesNotMatch(rendered, new RegExp(escapeRegExp(String("deep-interview"))));
		assert.doesNotMatch(rendered, new RegExp(escapeRegExp(String("ralplan:planner"))));
	});
});
