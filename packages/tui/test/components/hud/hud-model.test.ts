import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	applyHudStatusFlags,
	formatHudLine,
	type HudLineEntry,
	type HudSummary,
	hudChip,
	normalizeHudChip,
	normalizeHudSeverity,
	normalizeHudSummary,
	progressChip,
} from "#tui/components/hud/model";

describe("hudChip", () => {
	it("coerces numeric/boolean values to strings", () => {
		assert.deepEqual(hudChip("count", 3, 1), { label: "count", value: "3", priority: 1 });
		assert.deepEqual(hudChip("flag", true, 1), { label: "flag", value: "true", priority: 1 });
	});

	it("omits severity when not provided", () => {
		assert.deepEqual(hudChip("x", "y", 1), { label: "x", value: "y", priority: 1 });
	});

	it("includes severity when provided", () => {
		assert.deepEqual(hudChip("x", "y", 1, "warning"), {
			label: "x",
			value: "y",
			priority: 1,
			severity: "warning",
		});
	});
});

describe("progressChip", () => {
	it("formats done/total with the progress label and default priority 25", () => {
		assert.deepEqual(progressChip(2, 5), { label: "progress", value: "2/5", priority: 25 });
	});

	it("honors an explicit priority", () => {
		assert.deepEqual(progressChip(0, 10, 5), { label: "progress", value: "0/10", priority: 5 });
	});
});

describe("normalizeHudSeverity", () => {
	for (const sev of ["info", "warning", "blocked", "error", "success"] as const) {
		it(`accepts ${sev}`, () => {
			assert.equal(normalizeHudSeverity(sev), sev);
		});
	}

	it("rejects unknown values", () => {
		assert.equal(normalizeHudSeverity("critical"), undefined);
		assert.equal(normalizeHudSeverity(undefined), undefined);
		assert.equal(normalizeHudSeverity(123), undefined);
	});
});

describe("normalizeHudChip", () => {
	it("rejects non-objects", () => {
		assert.equal(normalizeHudChip(null), undefined);
		assert.equal(normalizeHudChip("x"), undefined);
		assert.equal(normalizeHudChip([]), undefined);
	});

	it("rejects chips without a label", () => {
		assert.equal(normalizeHudChip({ value: "y" }), undefined);
		assert.equal(normalizeHudChip({ label: "   " }), undefined);
	});

	it("strips ANSI escapes and control whitespace from label and value", () => {
		// Sanitization strips ANSI escapes and replaces control whitespace (CR/LF)
		// with a space, then collapses runs. Tabs are not C0 control chars and are
		// left intact, so avoid tabs in the test input.
		const chip = normalizeHudChip({ label: "la\x1b[31mbel\r\n", value: "va\x1b[0mlue" });
		assert.deepEqual(chip, { label: "label", value: "value" });
	});

	it("truncates label to 32 and value to 80", () => {
		const longLabel = "L".repeat(100);
		const longValue = "V".repeat(200);
		const chip = normalizeHudChip({ label: longLabel, value: longValue });
		assert.equal(chip?.label.length, 32);
		assert.equal(chip?.value?.length, 80);
	});

	it("drops value when empty after sanitization", () => {
		const chip = normalizeHudChip({ label: "ok", value: "  \x1b[31m  " });
		assert.deepEqual(chip, { label: "ok" });
	});

	it("preserves priority only when a finite number", () => {
		assert.deepEqual(normalizeHudChip({ label: "a", priority: 5 }), { label: "a", priority: 5 });
		assert.deepEqual(normalizeHudChip({ label: "a", priority: Number.NaN }), { label: "a" });
		assert.deepEqual(normalizeHudChip({ label: "a", priority: "3" as unknown as number }), { label: "a" });
	});

	it("preserves severity when valid and drops it otherwise", () => {
		assert.deepEqual(normalizeHudChip({ label: "a", severity: "warning" }), {
			label: "a",
			severity: "warning",
		});
		assert.deepEqual(normalizeHudChip({ label: "a", severity: "nope" }), { label: "a" });
	});
});

describe("normalizeHudSummary", () => {
	it("rejects non-objects and non-version-1", () => {
		assert.equal(normalizeHudSummary(null), undefined);
		assert.equal(normalizeHudSummary({ version: 2 }), undefined);
		assert.equal(normalizeHudSummary({}), undefined);
	});

	it("returns a minimal version:1 summary for empty input", () => {
		assert.deepEqual(normalizeHudSummary({ version: 1 }), { version: 1 });
	});

	it("normalizes chips (max 6) and details (max 12), dropping invalid ones", () => {
		const chips = Array.from({ length: 8 }, (_, i) => ({ label: `c${i}` }));
		const details = Array.from({ length: 15 }, (_, i) => ({ label: `d${i}` }));
		const summary = normalizeHudSummary({
			version: 1,
			chips: [...chips, { value: "no-label" }],
			details: [...details, "bad"],
		}) as HudSummary;
		assert.equal(summary.chips?.length, 6);
		assert.equal(summary.details?.length, 12);
		assert.equal(summary.chips?.[0]?.label, "c0");
		assert.equal(summary.details?.[0]?.label, "d0");
	});

	it("truncates summary to 120 chars and updated_at to 40", () => {
		const summary = normalizeHudSummary({
			version: 1,
			summary: "S".repeat(200),
			updated_at: "U".repeat(100),
		}) as HudSummary;
		assert.equal(summary.summary?.length, 120);
		assert.equal(summary.updated_at?.length, 40);
	});

	it("drops empty chip/detail arrays", () => {
		const summary = normalizeHudSummary({ version: 1, chips: [], details: [] }) as HudSummary;
		assert.equal("chips" in summary, false);
		assert.equal("details" in summary, false);
	});
});

describe("applyHudStatusFlags", () => {
	it("is a no-op when stale is false/omitted", () => {
		const entry: HudLineEntry = { id: "x", hud: { version: 1, severity: "info" } };
		assert.equal(applyHudStatusFlags(entry), entry);
		assert.equal(applyHudStatusFlags(entry, { stale: false }), entry);
	});

	it("forces warning severity and stale flag when stale is true and severity is not error/blocked", () => {
		const entry = { id: "x", hud: { version: 1, severity: "info" } } as HudLineEntry;
		const out = applyHudStatusFlags(entry, { stale: true });
		assert.equal(out.stale, true);
		assert.equal(out.hud?.severity, "warning");
	});

	it("adds a warning severity when there was no hud", () => {
		const out = applyHudStatusFlags({ id: "x" } as HudLineEntry, { stale: true });
		assert.equal(out.stale, true);
		assert.equal(out.hud?.severity, "warning");
		assert.equal(out.hud?.version, 1);
	});

	it("preserves error/blocked severity even when stale", () => {
		for (const severity of ["error", "blocked"] as const) {
			const out = applyHudStatusFlags({ id: "x", hud: { version: 1, severity } } as HudLineEntry, { stale: true });
			assert.equal(out.stale, true);
			assert.equal(out.hud?.severity, severity);
		}
	});
});

describe("formatHudLine", () => {
	it("prefixes stale entries and joins id/phase/chips", () => {
		const line = formatHudLine({
			id: "src",
			phase: "running",
			hud: { version: 1, chips: [{ label: "a", value: "1", priority: 2 }] },
		});
		assert.equal(line, "src | running | a=1");
	});

	it("sorts chips by priority ascending then labels chips without values", () => {
		// Chips are sorted by priority ascending and joined with a space (not `|`).
		const line = formatHudLine({
			id: "src",
			hud: {
				version: 1,
				chips: [
					{ label: "b", priority: 1 },
					{ label: "a", value: "x", priority: 0 },
				],
			},
		});
		assert.equal(line, "src | a=x b");
	});

	it("adds the stale prefix", () => {
		assert.equal(formatHudLine({ id: "src", stale: true }), "[stale] src");
	});
});
