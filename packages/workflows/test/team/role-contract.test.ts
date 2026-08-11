import { describe, expect, it } from "vitest";
import { assertRoleResult } from "#workflows/skills/team/role-contract";
import type { TeamSnapshot } from "#workflows/skills/team/types";

const base: TeamSnapshot = {
	team_id: "team-1",
	phase: "running",
	task_total: 1,
	task_counts: { pending: 0, blocked: 0, in_progress: 1, completed: 0, failed: 0 },
	workers: [],
	tasks: [
		{
			version: 1,
			id: "task-1",
			title: "Task",
			description: "Task",
			status: "in_progress",
			created_at: "2026-08-02T00:00:00.000Z",
			updated_at: "2026-08-02T00:00:00.000Z",
		},
	],
	updated_at: "2026-08-02T00:00:00.000Z",
};

describe("team role contracts", () => {
	it("allows worker results without a gate", () => {
		expect(() => assertRoleResult(base, "worker", "task-1")).not.toThrow();
	});

	it("rejects reviewer results without a review gate", () => {
		expect(() => assertRoleResult(base, "reviewer", "task-1")).toThrow("review_report");
	});

	it("requires a passing structured review report", () => {
		const gate = { gate: "review" as const, attempt: 1, updated_at: base.updated_at };
		expect(() =>
			assertRoleResult(
				{ ...base, tasks: [{ ...base.tasks[0], review_gate: { ...gate, status: "retry_requested" as const } }] },
				"reviewer",
				"task-1",
			),
		).toThrow("passing review_report");
		expect(() =>
			assertRoleResult(
				{ ...base, tasks: [{ ...base.tasks[0], review_gate: { ...gate, status: "passed" as const } }] },
				"reviewer",
				"task-1",
			),
		).toThrow("invalid review_report max_severity");
		expect(() =>
			assertRoleResult(
				{
					...base,
					tasks: [
						{
							...base.tasks[0],
							review_gate: { ...gate, status: "passed" as const, max_severity: "high", needs_changes: true },
						},
					],
				},
				"reviewer",
				"task-1",
			),
		).toThrow("blocking review_report");
		expect(() =>
			assertRoleResult(
				{
					...base,
					tasks: [
						{
							...base.tasks[0],
							review_gate: {
								...gate,
								status: "passed" as const,
								max_severity: "none",
								needs_changes: false,
							},
						},
					],
				},
				"reviewer",
				"task-1",
			),
		).not.toThrow();
	});

	it("requires a passing structured evidence matrix", () => {
		expect(() => assertRoleResult(base, "prover")).toThrow("evidence_matrix");
		const gate = { gate: "completion" as const, attempt: 1, updated_at: base.updated_at };
		expect(() => assertRoleResult({ ...base, completion_gate: { ...gate, status: "blocked" } }, "prover")).toThrow(
			"passing evidence_matrix",
		);
		expect(() => assertRoleResult({ ...base, completion_gate: { ...gate, status: "passed" } }, "prover")).toThrow(
			"invalid evidence_matrix ship_decision",
		);
		expect(() =>
			assertRoleResult(
				{
					...base,
					completion_gate: {
						...gate,
						status: "passed",
						ship_decision: "blocked",
						escalation: "none",
					},
				},
				"prover",
			),
		).toThrow("blocking evidence_matrix");
		expect(() =>
			assertRoleResult(
				{
					...base,
					completion_gate: {
						...gate,
						status: "passed",
						ship_decision: "ship",
						escalation: "none",
					},
				},
				"prover",
			),
		).not.toThrow();
	});
});
