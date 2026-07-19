import { collapsePlanningPipeline, type WorkflowActiveEntry } from "@tsuuanmi/pi-workflows";
import { describe, expect, it } from "vitest";
import { renderSkillHudBar } from "#coding-agent/modes/interactive/components/skill-hud/render";

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
function stripAnsiLocal(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}
function visibleWidth(text: string): number {
	return stripAnsiLocal(text).length;
}

function entry(overrides: Partial<WorkflowActiveEntry> & { skill: WorkflowActiveEntry["skill"] }): WorkflowActiveEntry {
	return { active: true, phase: "running", updated_at: new Date().toISOString(), ...overrides };
}

describe("renderSkillHudBar", () => {
	it("returns null when there are no active skills", () => {
		expect(renderSkillHudBar([], 80)).toBeNull();
	});

	it("returns null when all entries are inactive", () => {
		expect(renderSkillHudBar([entry({ skill: "team", active: false })], 80)).toBeNull();
	});

	it("renders the active skill and phase compactly", () => {
		const rendered = renderSkillHudBar([entry({ skill: "team", phase: "running" })], 80);
		expect(rendered).not.toBeNull();
		const plain = stripAnsiLocal(rendered ?? "");
		expect(plain).toContain("hud");
		expect(plain).toContain("team:running");
	});

	it("sanitizes newline/tab and ANSI escapes in skill/phase", () => {
		const rendered = renderSkillHudBar(
			[entry({ skill: "team\n\x1b[31mred" as never, phase: "running\twith phase" })],
			80,
		);
		expect(rendered).not.toBeNull();
		const plain = stripAnsiLocal(rendered ?? "");
		expect(plain).not.toContain("\n");
		expect(plain).not.toContain("\t");
	});

	it("truncates the bar to the available width", () => {
		const rendered = renderSkillHudBar(
			[entry({ skill: "team", phase: "running-with-a-very-very-long-phase-name" })],
			30,
		);
		expect(rendered).not.toBeNull();
		expect(visibleWidth(rendered ?? "")).toBeLessThanOrEqual(30);
	});

	it("emits a warn:stale chip when the entry is stale", () => {
		const rendered = stripAnsiLocal(
			renderSkillHudBar([entry({ skill: "ralplan", phase: "planning", stale: true })], 120) ?? "",
		);
		expect(rendered).toContain("warn:stale");
	});

	it("sorts chips by priority and prefixes severity", () => {
		const rendered = stripAnsiLocal(
			renderSkillHudBar(
				[
					entry({
						skill: "ralplan",
						phase: "planning",
						hud: {
							version: 1,
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
		expect(stageIdx).toBeGreaterThan(-1);
		expect(verdictIdx).toBeGreaterThan(stageIdx);
		expect(rendered).toContain("warn:verdict=ITERATE");
	});

	it("renders multiple non-pipeline skills joined by +", () => {
		const rendered = stripAnsiLocal(
			renderSkillHudBar(
				[entry({ skill: "team", phase: "running" }), entry({ skill: "ultragoal", phase: "active" })],
				120,
			) ?? "",
		);
		// ultragoal is a pipeline skill; team is not. Both kept (only one
		// pipeline entry present, so no collapse).
		expect(rendered).toContain("team:running");
		expect(rendered).toContain("ultragoal:active");
		expect(rendered).toContain("+");
	});
});

describe("collapsePlanningPipeline", () => {
	it("keeps only the most recently updated pipeline skill", () => {
		const entries: WorkflowActiveEntry[] = [
			entry({ skill: "deep-interview", phase: "intent-first", updated_at: "2026-01-01T00:00:00.000Z" }),
			entry({ skill: "ralplan", phase: "planner", updated_at: "2026-01-02T00:00:00.000Z" }),
			entry({ skill: "ultragoal", phase: "active", updated_at: "2026-01-03T00:00:00.000Z" }),
		];
		const collapsed = collapsePlanningPipeline(entries);
		expect(collapsed).toHaveLength(1);
		expect(collapsed[0].skill).toBe("ultragoal");
	});

	it("leaves non-pipeline skills untouched", () => {
		const entries: WorkflowActiveEntry[] = [
			entry({ skill: "team", phase: "running", updated_at: "2026-01-01T00:00:00.000Z" }),
			entry({ skill: "ralplan", phase: "planner", updated_at: "2026-01-02T00:00:00.000Z" }),
		];
		const collapsed = collapsePlanningPipeline(entries);
		expect(collapsed.map((e) => e.skill)).toEqual(["team", "ralplan"]);
	});

	it("is a passthrough for a single pipeline entry", () => {
		const entries: WorkflowActiveEntry[] = [entry({ skill: "ralplan", phase: "planner" })];
		expect(collapsePlanningPipeline(entries)).toEqual(entries);
	});
});

describe("renderSkillHudBar — pipeline collapse integration", () => {
	it("renders only the latest pipeline skill after collapse", () => {
		const rendered = stripAnsiLocal(
			renderSkillHudBar(
				[
					entry({ skill: "deep-interview", phase: "intent-first", updated_at: "2026-01-01T00:00:00.000Z" }),
					entry({ skill: "ralplan", phase: "planner", updated_at: "2026-01-02T00:00:00.000Z" }),
					entry({ skill: "ultragoal", phase: "active", updated_at: "2026-01-03T00:00:00.000Z" }),
				],
				120,
			) ?? "",
		);
		expect(rendered).toContain("ultragoal:active");
		expect(rendered).not.toContain("deep-interview");
		expect(rendered).not.toContain("ralplan:planner");
	});
});
