import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	appendJsonlIdempotent,
	readExistingStateForMutation,
	writeTextArtifact,
} from "../src/workflows/state-writer.ts";
import { readWorkflowState, writeWorkflowState } from "../src/workflows/workflow-state.ts";

describe("workflow runtime", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-workflows-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("writes workflow state with receipt and checksum", async () => {
		const state = await writeWorkflowState(cwd, "ralplan", { current_phase: "planner", run_id: "run-1" });

		expect(state.skill).toBe("ralplan");
		expect(state.version).toBe(1);
		expect(state.active).toBe(true);
		expect(state.receipt).toMatchObject({ owner: "pi-workflow", skill: "ralplan" });
		expect((state.receipt as Record<string, unknown>).content_sha256).toMatchObject({ algorithm: "sha256" });

		const reread = await readWorkflowState(cwd, "ralplan");
		expect(reread?.run_id).toBe("run-1");
	});

	it("reports corrupt state for mutation reads", async () => {
		const path = join(cwd, ".pi", "workflows", "ralplan", "state.json");
		await mkdir(join(cwd, ".pi", "workflows", "ralplan"), { recursive: true });
		await writeFile(path, "not json", "utf8");

		const result = await readExistingStateForMutation(path);
		expect(result.kind).toBe("corrupt");
		await expect(writeWorkflowState(cwd, "ralplan", { current_phase: "planner" })).rejects.toThrow(/corrupt/);
	});

	it("rejects writes outside project .pi when cwd confinement is supplied", async () => {
		await expect(writeTextArtifact(join(cwd, "outside.md"), "nope", { cwd })).rejects.toThrow(/\.pi/);
	});

	it("appends JSONL idempotently", async () => {
		const path = join(cwd, ".pi", "plans", "ralplan", "run-1", "index.jsonl");
		const row = { stage: "planner", stage_n: 1, sha256: "abc" };
		const key = (entry: unknown): string | undefined => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
			const record = entry as Record<string, unknown>;
			return `${record.stage}:${record.stage_n}:${record.sha256}`;
		};

		expect((await appendJsonlIdempotent(path, row, { cwd, key })).appended).toBe(true);
		expect((await appendJsonlIdempotent(path, row, { cwd, key })).appended).toBe(false);
		expect((await readFile(path, "utf8")).trim().split(/\r?\n/)).toHaveLength(1);
	});

	it("writes artifacts inside .pi", async () => {
		const path = join(cwd, ".pi", "specs", "demo.md");
		const result = await writeTextArtifact(path, "hello", { cwd });
		expect(result.sha256).toHaveLength(64);
		expect(await readFile(path, "utf8")).toBe("hello\n");
	});
});
