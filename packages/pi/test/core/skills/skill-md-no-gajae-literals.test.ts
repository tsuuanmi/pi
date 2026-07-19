import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Grep-guard: no Gajae literals should appear in the two SKILL.md files
 * or the three new source files (session-layout.ts, session-resolution.ts,
 * vagueness-gate.ts). This prevents leakage of Gajae-internal paths/names
 * into Pi's user-visible behavior.
 */
const GJC_PATTERN = /\b\.gjc\b|gjc-|GJC_SESSION_ID|\bgjc\b/;

const FILES_TO_CHECK = [
	"../workflows/src/skills/deep-interview/SKILL.md",
	"../workflows/src/skills/ralplan/SKILL.md",
	"../workflows/src/runtime/shared/session-layout.ts",
	"../workflows/src/runtime/shared/session-resolution.ts",
	// vagueness-gate.ts will be added in Step 3
];

describe("skill-md no-gajae-literals", () => {
	it("has no Gajae-internal literals in SKILL.md files or new source files", async () => {
		const root = join(import.meta.dirname, "..", "..");
		for (const file of FILES_TO_CHECK) {
			const filePath = join(root, file);
			let content: string;
			try {
				content = await readFile(filePath, "utf8");
			} catch {
				// File may not exist yet (e.g., vagueness-gate.ts)
				continue;
			}
			const matches = content.match(GJC_PATTERN);
			expect(matches, `Found Gajae literals in ${file}: ${matches?.join(", ")}`).toBeNull();
		}
	});
});
