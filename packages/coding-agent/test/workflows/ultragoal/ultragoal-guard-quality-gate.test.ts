import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { assert, expect, test } from "vitest";
import { ultragoalLedgerPath } from "../../../src/workflows/shared/paths.ts";
import { ultragoalGuard } from "../../../src/workflows/ultragoal/ultragoal-guard.ts";
import { validateExecutorQaEvidence } from "../../../src/workflows/ultragoal/ultragoal-quality-gate.ts";
import {
	checkpointUltragoalGoal,
	createUltragoalPlan,
	startNextUltragoalGoal,
} from "../../../src/workflows/ultragoal/ultragoal-runtime.ts";

const sessionId = "test-session-id";

const PNG_CRC_TABLE = new Uint32Array(256).map((_, index) => {
	let crc = index;
	for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	return crc >>> 0;
});

function pngCrc32(bytes: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const typeBuf = Buffer.from(type, "ascii");
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(pngCrc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([length, typeBuf, data, crcBuf]);
}

/** Build an RGBA PNG (color type 6, bit depth 8) from a pixel function. */
function buildPng(
	width: number,
	height: number,
	pixel: (x: number, y: number) => [number, number, number, number],
): Buffer {
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace
	// Raw image data: each row prefixed with a filter byte (0 = none), then RGBA.
	const rowLength = 1 + width * 4;
	const raw = Buffer.alloc(rowLength * height);
	for (let y = 0; y < height; y += 1) {
		raw[y * rowLength] = 0; // filter: none
		for (let x = 0; x < width; x += 1) {
			const [r, g, b, a] = pixel(x, y);
			const offset = y * rowLength + 1 + x * 4;
			raw[offset] = r;
			raw[offset + 1] = g;
			raw[offset + 2] = b;
			raw[offset + 3] = a;
		}
	}
	const idat = deflateSync(raw);
	return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function nonUniformPng(): Buffer {
	return buildPng(320, 180, (x, y) => [(x * 7) % 256, (y * 5 + x) % 256, ((x ^ y) * 3) % 256, 255]);
}

function uniformPng(): Buffer {
	return buildPng(320, 180, () => [128, 128, 128, 255]);
}

function truncatedPng(): Buffer {
	const full = nonUniformPng();
	return full.subarray(0, 40); // too short / no IEND
}

function validAutomationTranscript(): string {
	return JSON.stringify({
		schemaVersion: 1,
		surface: "web",
		tool: "playwright",
		actions: [
			{ type: "goto", url: "https://example.test", timestamp: 1, selector: "body" },
			{ type: "click", selector: "#go", timestamp: 2 },
		],
		assertions: [{ status: "passed", timestamp: 3, selector: "#result" }],
	});
}

function nonMonotonicTranscript(): string {
	return JSON.stringify({
		schemaVersion: 1,
		surface: "web",
		tool: "playwright",
		actions: [
			{ type: "goto", url: "https://example.test", timestamp: 5, selector: "body" },
			{ type: "click", selector: "#go", timestamp: 1 },
		],
	});
}

function controlSequenceFreePty(): string {
	// No ANSI escapes, but long enough printable run — should be rejected.
	return "plain text output without any control sequences at all here it is".padEnd(600, "x");
}

async function withDir<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await mkdtemp(join(tmpdir(), "pi-ug-qg-"));
	try {
		return await fn(cwd);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

async function writeFixture(cwd: string, rel: string, bytes: Buffer | string): Promise<string> {
	const path = join(cwd, rel);
	await mkdir(join(path, ".."), { recursive: true });
	await writeFile(path, bytes);
	return path;
}

const PASSED = "passed";

/** A typed cli-surface quality gate using a verifiedReceipt (no real artifacts needed). */
function cliQualityGate(): Record<string, unknown> {
	return {
		executorQa: {
			artifactRefs: [
				{
					id: "a1",
					kind: "cli-replay",
					description: "Ran focused checks",
					verifiedReceipt: { verifiedAt: "2026-06-21T00:00:00.000Z", summary: "checks passed" },
				},
			],
			surfaceEvidence: [
				{
					id: "s1",
					surface: "cli",
					contractRef: "plan#a",
					invocation: "npm run check",
					result: PASSED,
					artifactRefs: ["a1"],
				},
			],
		},
		contractCoverage: [
			{ id: "c1", contractRef: "plan#a", obligation: "focused checks pass", status: PASSED, artifactRefs: ["a1"] },
		],
	};
}

test("quality gate rejects free-form {status} objects (hard break)", async () => {
	await withDir(async (cwd) => {
		await expect(validateExecutorQaEvidence(cwd, { status: "passed" })).rejects.toThrow(/free-form/);
	});
});

test("quality gate rejects stray top-level keys alongside typed rows (Gajae parity)", async () => {
	await withDir(async (cwd) => {
		const gate = { status: "passed", ...cliQualityGate() };
		await expect(validateExecutorQaEvidence(cwd, gate)).rejects.toThrow(/unsupported keys: status/);
	});
});

test("quality gate rejects missing executorQa or contractCoverage", async () => {
	await withDir(async (cwd) => {
		await expect(
			validateExecutorQaEvidence(cwd, { executorQa: { artifactRefs: [], surfaceEvidence: [] } }),
		).rejects.toThrow(/contractCoverage/);
		await expect(
			validateExecutorQaEvidence(cwd, {
				contractCoverage: [{ id: "c1", contractRef: "p", obligation: "o", status: "passed" }],
			}),
		).rejects.toThrow(/executorQa/);
	});
});

test("quality gate rejects unknown artifactRefs id links", async () => {
	await withDir(async (cwd) => {
		const gate = {
			executorQa: {
				artifactRefs: [
					{ id: "a1", kind: "cli-replay", description: "ran", verifiedReceipt: { verifiedAt: "t", summary: "s" } },
				],
				surfaceEvidence: [
					{
						id: "s1",
						surface: "cli",
						contractRef: "p",
						invocation: "c",
						result: "passed",
						artifactRefs: ["a-missing"],
					},
				],
			},
			contractCoverage: [{ id: "c1", contractRef: "p", obligation: "o", status: "passed", artifactRefs: ["a1"] }],
		};
		await expect(validateExecutorQaEvidence(cwd, gate)).rejects.toThrow(/unknown id/);
	});
});

test("quality gate rejects contractCoverage with a non-not_applicable non-success row", async () => {
	await withDir(async (cwd) => {
		const gate = {
			executorQa: {
				artifactRefs: [
					{ id: "a1", kind: "cli-replay", description: "ran", verifiedReceipt: { verifiedAt: "t", summary: "s" } },
				],
				surfaceEvidence: [
					{ id: "s1", surface: "cli", contractRef: "p", invocation: "c", result: "passed", artifactRefs: ["a1"] },
				],
			},
			contractCoverage: [{ id: "c1", contractRef: "p", obligation: "o", status: "failed", artifactRefs: ["a1"] }],
		};
		await expect(validateExecutorQaEvidence(cwd, gate)).rejects.toThrow(/must be covered, passed, verified/);
	});
});

test("quality gate rejects non-not_applicable surfaceEvidence row without artifactRefs links", async () => {
	await withDir(async (cwd) => {
		const gate = {
			executorQa: {
				artifactRefs: [
					{ id: "a1", kind: "cli-replay", description: "ran", verifiedReceipt: { verifiedAt: "t", summary: "s" } },
				],
				surfaceEvidence: [{ id: "s1", surface: "cli", contractRef: "p", invocation: "c", result: "passed" }],
			},
			contractCoverage: [{ id: "c1", contractRef: "p", obligation: "o", status: "passed", artifactRefs: ["a1"] }],
		};
		await expect(validateExecutorQaEvidence(cwd, gate)).rejects.toThrow(/artifactRefs/);
	});
});

test("quality gate accepts not_applicable rows with a reason and no links", async () => {
	await withDir(async (cwd) => {
		const gate = {
			executorQa: {
				artifactRefs: [
					{ id: "a1", kind: "cli-replay", description: "ran", verifiedReceipt: { verifiedAt: "t", summary: "s" } },
				],
				surfaceEvidence: [
					{ id: "s1", surface: "cli", contractRef: "p", invocation: "c", result: "passed", artifactRefs: ["a1"] },
					{
						id: "s2",
						status: "not_applicable",
						surface: "cli",
						contractRef: "p#b",
						invocation: "n/a",
						reason: "out of scope",
					},
				],
			},
			contractCoverage: [
				{ id: "c1", contractRef: "p", obligation: "o", status: "passed", artifactRefs: ["a1"] },
				{ id: "c2", contractRef: "p#b", obligation: "n/a", status: "not_applicable", reason: "out of scope" },
			],
		};
		await validateExecutorQaEvidence(cwd, gate);
	});
});

test("structural artifact validation rejects a uniform screenshot", async () => {
	await withDir(async (cwd) => {
		const png = uniformPng();
		const path = await writeFixture(cwd, "shot.png", png);
		const gate = {
			executorQa: {
				artifactRefs: [{ id: "a1", kind: "screenshot", description: "ui", path }],
				surfaceEvidence: [
					{
						id: "s1",
						surface: "native",
						contractRef: "p",
						invocation: "open",
						result: "passed",
						artifactRefs: ["a1"],
					},
				],
			},
			contractCoverage: [{ id: "c1", contractRef: "p", obligation: "o", status: "passed", artifactRefs: ["a1"] }],
		};
		await expect(validateExecutorQaEvidence(cwd, gate)).rejects.toThrow(/non-uniform|screenshot/);
	});
});

test("structural artifact validation rejects a truncated png and a missing referenced file", async () => {
	await withDir(async (cwd) => {
		const truncated = truncatedPng();
		const path = await writeFixture(cwd, "bad.png", truncated);
		const gate = {
			executorQa: {
				artifactRefs: [{ id: "a1", kind: "screenshot", description: "ui", path }],
				surfaceEvidence: [
					{
						id: "s1",
						surface: "native",
						contractRef: "p",
						invocation: "open",
						result: "passed",
						artifactRefs: ["a1"],
					},
				],
			},
			contractCoverage: [{ id: "c1", contractRef: "p", obligation: "o", status: "passed", artifactRefs: ["a1"] }],
		};
		await expect(validateExecutorQaEvidence(cwd, gate)).rejects.toThrow(/decodable|screenshot|existing file/);

		// Missing referenced file path.
		const gateMissing = {
			executorQa: {
				artifactRefs: [{ id: "a2", kind: "screenshot", description: "ui", path: join(cwd, "nope.png") }],
				surfaceEvidence: [
					{
						id: "s2",
						surface: "native",
						contractRef: "p",
						invocation: "open",
						result: "passed",
						artifactRefs: ["a2"],
					},
				],
			},
			contractCoverage: [{ id: "c2", contractRef: "p", obligation: "o", status: "passed", artifactRefs: ["a2"] }],
		};
		await expect(validateExecutorQaEvidence(cwd, gateMissing)).rejects.toThrow(/existing file|screenshot|live proof/);
	});
});

test("structural artifact validation rejects a non-monotonic automation transcript", async () => {
	await withDir(async (cwd) => {
		const shotPath = await writeFixture(cwd, "shot.png", nonUniformPng());
		const transcriptPath = await writeFixture(cwd, "transcript.json", nonMonotonicTranscript());
		const gate = {
			executorQa: {
				artifactRefs: [
					{ id: "shot", kind: "screenshot", description: "ui", path: shotPath },
					{ id: "auto", kind: "automation", description: "browser run", path: transcriptPath },
				],
				surfaceEvidence: [
					{
						id: "s1",
						surface: "web",
						contractRef: "p",
						invocation: "run",
						result: "passed",
						artifactRefs: ["shot", "auto"],
					},
				],
			},
			contractCoverage: [
				{ id: "c1", contractRef: "p", obligation: "o", status: "passed", artifactRefs: ["shot", "auto"] },
			],
		};
		await expect(validateExecutorQaEvidence(cwd, gate)).rejects.toThrow(/monotonic|transcript/);
	});
});

test("structural artifact validation rejects a PTY capture with no control sequences", async () => {
	await withDir(async (cwd) => {
		const path = await writeFixture(cwd, "pty.log", controlSequenceFreePty());
		const gate = {
			executorQa: {
				artifactRefs: [{ id: "a1", kind: "pty", description: "terminal", path }],
				surfaceEvidence: [
					{
						id: "s1",
						surface: "native",
						contractRef: "p",
						invocation: "run",
						result: "passed",
						artifactRefs: ["a1"],
					},
				],
			},
			contractCoverage: [{ id: "c1", contractRef: "p", obligation: "o", status: "passed", artifactRefs: ["a1"] }],
		};
		await expect(validateExecutorQaEvidence(cwd, gate)).rejects.toThrow(/control sequences|PTY|transcript/);
	});
});

test("a valid web surface quality gate with non-uniform screenshot + automation transcript passes", async () => {
	await withDir(async (cwd) => {
		const shotPath = await writeFixture(cwd, "shot.png", nonUniformPng());
		const transcriptPath = await writeFixture(cwd, "transcript.json", validAutomationTranscript());
		const gate = {
			executorQa: {
				artifactRefs: [
					{ id: "shot", kind: "screenshot", description: "ui", path: shotPath },
					{ id: "auto", kind: "automation", description: "browser run", path: transcriptPath },
				],
				surfaceEvidence: [
					{
						id: "s1",
						surface: "web",
						contractRef: "p",
						invocation: "playwright run",
						result: "passed",
						artifactRefs: ["shot", "auto"],
					},
				],
			},
			contractCoverage: [
				{ id: "c1", contractRef: "p", obligation: "o", status: "passed", artifactRefs: ["shot", "auto"] },
			],
		};
		await validateExecutorQaEvidence(cwd, gate);
	});
});

test("guard: inactive when no plan exists", async () => {
	await withDir(async (cwd) => {
		const diag = await ultragoalGuard(cwd, sessionId);
		assert.strictEqual(diag.state, "inactive");
	});
});

test("guard: unrelated_goal when objective does not match", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		const diag = await ultragoalGuard(cwd, sessionId, { currentObjective: "totally unrelated objective text" });
		assert.strictEqual(diag.state, "unrelated_goal");
	});
});

test("guard: active_missing_receipt when a complete goal has no fresh receipt", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		// Mark the active goal complete WITHOUT going through the hardened checkpoint
		// by writing a plan directly with status complete and no completionVerification.
		// Easiest path: checkpoint as failed then the guard sees no receipt.
		await checkpointUltragoalGoal(cwd, { goalId: "G001", status: "failed" }, sessionId);
		const diag = await ultragoalGuard(cwd, sessionId, { goalId: "G001" });
		// G001 is failed (terminal-ish) with no receipt -> missing receipt for per-goal.
		assert.strictEqual(diag.state, "active_missing_receipt");
	});
});

test("guard: active_verified_complete after a valid typed checkpoint", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented and verified the runtime-owned state with focused automated checks.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		const diag = await ultragoalGuard(cwd, sessionId, { goalId: "G001" });
		assert.strictEqual(diag.state, "active_verified_complete", diag.message);
	});
});

test("guard: active_review_blocked_unrecorded for a review_blocked active goal", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await checkpointUltragoalGoal(cwd, { goalId: "G001", status: "review_blocked" }, sessionId);
		const diag = await ultragoalGuard(cwd, sessionId, { goalId: "G001" });
		assert.strictEqual(diag.state, "active_review_blocked_unrecorded", diag.message);
	});
});

test("guard: story objective resolves to that goal's per-goal receipt (Gajae parity)", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A.\n@goal B\nDo B." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented and verified the first goal with focused automated checks.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		// G002 still pending. A story objective matching G001's own objective text must
		// take the per-goal branch (resolve G001's per-goal receipt), NOT the
		// final-aggregate branch (which would find no final receipt and omit goalId).
		const diag = await ultragoalGuard(cwd, sessionId, { currentObjective: "Do A." });
		assert.strictEqual(diag.state, "active_missing_final_receipt", diag.message);
		assert.strictEqual(diag.goalId, "G001", diag.message);
	});
});

test("guard: objective path flags any sibling review_blocked (Gajae parity)", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A.\n@goal B\nDo B." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		// G001 verified complete with a per-goal receipt; G002 is review_blocked.
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented and verified the first goal with focused automated checks.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await checkpointUltragoalGoal(cwd, { goalId: "G002", status: "review_blocked" }, sessionId);
		// Inspecting G001 by goalId still reports verified (focused per-goal view).
		const perGoal = await ultragoalGuard(cwd, sessionId, { goalId: "G001" });
		assert.strictEqual(perGoal.state, "active_verified_complete", perGoal.message);
		// The aggregate objective path sees the sibling blocker.
		const objective = await ultragoalGuard(cwd, sessionId);
		assert.strictEqual(objective.state, "active_review_blocked_unrecorded", objective.message);
	});
});

test("guard: objective path returns active_missing_final_receipt when a verified per-goal goal leaves siblings incomplete", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A.\n@goal B\nDo B." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented and verified the first goal with focused automated checks.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		// G001 has a fresh per-goal receipt; G002 is still pending. The aggregate
		// objective path must report incomplete required goals.
		const diag = await ultragoalGuard(cwd, sessionId);
		assert.strictEqual(diag.state, "active_missing_final_receipt", diag.message);
	});
});

test("guard: unreadable_fail_closed for a corrupt ledger", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await mkdir(join(cwd, ".pi", "ultragoal"), { recursive: true });
		await writeFile(ultragoalLedgerPath(cwd, sessionId), `${JSON.stringify({ eventId: "ok" })}\n{bad json\n`);
		const diag = await ultragoalGuard(cwd, sessionId, { goalId: "G001" });
		assert.strictEqual(diag.state, "unreadable_fail_closed", diag.message);
	});
});

test("guard: active_missing_final_receipt when aggregate objective matches but no final receipt", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A.\n@goal B\nDo B." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		// Complete G001 with a per-goal receipt; the aggregate objective is still
		// unmatched (no final-aggregate receipt yet).
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented and verified the first goal with focused automated checks.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		const diag = await ultragoalGuard(cwd, sessionId, {
			currentObjective: "Complete all approved goals with verification",
		});
		assert.strictEqual(diag.state, "active_missing_final_receipt", diag.message);
	});
});

test("aggregate off-by-one: second-to-last goal is per-goal, last required goal is final-aggregate", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A.\n@goal B\nDo B." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		const first = await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented and verified the first goal with focused automated checks.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		assert.strictEqual(first.completionVerification?.receiptKind, "per-goal", "G001 is not the last required goal");
		await startNextUltragoalGoal(cwd, false, sessionId);
		const last = await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G002",
				status: "complete",
				evidence: "Implemented and verified the final goal with focused automated checks.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		assert.strictEqual(last.completionVerification?.receiptKind, "final-aggregate", "G002 is the last required goal");
	});
});

test("no Bun.* APIs in new ultragoal modules (portability)", async () => {
	for (const rel of [
		"src/workflows/ultragoal/ultragoal-receipt.ts",
		"src/workflows/ultragoal/ultragoal-artifacts.ts",
		"src/workflows/ultragoal/ultragoal-quality-gate.ts",
		"src/workflows/ultragoal/ultragoal-guard.ts",
	]) {
		const text = await readFile(join(import.meta.dirname, "..", "..", "..", rel), "utf8");
		// Ignore comment lines (block-comment ` *` and line-comment `//`) so the
		// rule only flags actual `Bun.` usage, not doc mentions.
		const codeLines = text
			.split(/\r?\n/)
			.filter((line) => !/^\s*(\*|\/\/)/.test(line))
			.join("\n");
		assert.ok(!/\bBun\./.test(codeLines), `${rel} must not use Bun.* APIs`);
	}
});
