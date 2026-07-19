import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { SegmentContext, StatusLineSessionLike } from "#tui/index";
import {
	computeUsageStats,
	formatCwdForFooter,
	formatTokens,
	initTheme,
	renderSegment,
	sanitizeStatusText,
	stripAnsi,
	visibleWidth,
} from "#tui/index";

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

before(() => {
	initTheme("dark");
});

function makeSession(overrides?: {
	model?: Partial<{ id: string; name: string; provider: string; reasoning: boolean; contextWindow: number }>;
	thinkingLevel?: string;
	cwd?: string;
	sessionName?: string;
	entries?: StatusLineSessionLike["sessionManager"] extends { getEntries(): infer T } ? T : never;
}): StatusLineSessionLike {
	return {
		state: {
			model: overrides?.model ?? {
				id: "test-model",
				name: "Test Model",
				provider: "test",
				contextWindow: 200_000,
				reasoning: false,
			},
			thinkingLevel: overrides?.thinkingLevel ?? "off",
		},
		sessionManager: {
			getEntries: () => overrides?.entries ?? [],
			getSessionName: () => overrides?.sessionName ?? "",
			getCwd: () => overrides?.cwd ?? "/tmp/project",
		},
		getContextUsage: () => ({ contextWindow: 200_000, percent: 12.3 }),
		subagentManager: { getActiveCount: () => 0 },
	};
}

function makeCtx(overrides?: Partial<SegmentContext>): SegmentContext {
	return {
		session: makeSession(),
		width: 120,
		options: {},
		usageStats: { input: 0, output: 0 },
		contextPercent: 12.3,
		contextWindow: 200_000,
		autoCompactEnabled: false,
		subagentCount: 0,
		availableProviderCount: 1,
		git: { branch: null, status: null },
		...overrides,
	};
}

describe("model segment", () => {
	it("renders the model name", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: {
					id: "claude-x",
					name: "Claude X",
					provider: "anthropic",
					reasoning: false,
					contextWindow: 200_000,
				},
			}),
		});
		assert.equal(stripAnsi(renderSegment("model", ctx).content), "Claude X");
	});

	it("folds the thinking level into the model segment when reasoning + level != off", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: { id: "m", name: "M", provider: "p", reasoning: true, contextWindow: 200_000 },
				thinkingLevel: "high",
			}),
			options: { model: { showThinkingLevel: true } },
		});
		const text = stripAnsi(renderSegment("model", ctx).content);
		assert.match(text, new RegExp(escapeRegExp(String("M"))));
		assert.match(text, new RegExp(escapeRegExp(String("high"))));
	});

	it("omits the thinking level when it is off", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: { id: "m", name: "M", provider: "p", reasoning: true, contextWindow: 200_000 },
				thinkingLevel: "off",
			}),
			options: { model: { showThinkingLevel: true } },
		});
		assert.equal(stripAnsi(renderSegment("model", ctx).content), "M");
	});

	it("omits the thinking level when showThinkingLevel is false even if reasoning + high", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: { id: "m", name: "M", provider: "p", reasoning: true, contextWindow: 200_000 },
				thinkingLevel: "high",
			}),
			options: { model: { showThinkingLevel: false } },
		});
		assert.equal(stripAnsi(renderSegment("model", ctx).content), "M");
	});

	it("shows the (provider) prefix when more than one provider is available", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: { id: "m", name: "M", provider: "anthropic", reasoning: false, contextWindow: 200_000 },
			}),
			availableProviderCount: 2,
			options: { model: { showProviderPrefix: true } },
		});
		assert.equal(stripAnsi(renderSegment("model", ctx).content), "(anthropic) M");
	});

	it("omits the (provider) prefix when only one provider is available", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: { id: "m", name: "M", provider: "anthropic", reasoning: false, contextWindow: 200_000 },
			}),
			availableProviderCount: 1,
			options: { model: { showProviderPrefix: true } },
		});
		assert.equal(stripAnsi(renderSegment("model", ctx).content), "M");
	});
});

describe("mode segment", () => {
	it("is hidden when no HUD phase is active", () => {
		const ctx = makeCtx({ hudPhase: undefined });
		assert.deepEqual(renderSegment("mode", ctx), { content: "", visible: false });
	});

	it("renders the active HUD phase", () => {
		const ctx = makeCtx({ hudPhase: "planner" });
		assert.equal(stripAnsi(renderSegment("mode", ctx).content), "planner");
	});
});

describe("git segment", () => {
	it("is hidden when neither branch nor status is available (non-git cwd)", () => {
		const ctx = makeCtx({ git: { branch: null, status: null } });
		assert.deepEqual(renderSegment("git", ctx), { content: "", visible: false });
	});

	it("renders a clean branch with the dim color", () => {
		const ctx = makeCtx({ git: { branch: "main", status: { staged: 0, unstaged: 0, untracked: 0 } } });
		const rendered = renderSegment("git", ctx);
		assert.equal(rendered.visible, true);
		assert.equal(stripAnsi(rendered.content), "main");
	});

	it("renders dirty indicators (*unstaged +staged ?untracked)", () => {
		const ctx = makeCtx({
			git: { branch: "main", status: { staged: 2, unstaged: 3, untracked: 1 } },
			options: { git: { showBranch: true, showStaged: true, showUnstaged: true, showUntracked: true } },
		});
		assert.equal(stripAnsi(renderSegment("git", ctx).content), "main *3 +2 ?1");
	});

	it("respects showUntracked: false", () => {
		const ctx = makeCtx({
			git: { branch: "main", status: { staged: 0, unstaged: 0, untracked: 5 } },
			options: { git: { showUntracked: false } },
		});
		assert.equal(stripAnsi(renderSegment("git", ctx).content), "main");
	});
});

describe("context_pct segment", () => {
	it("renders a known percent and window", () => {
		const ctx = makeCtx({ contextPercent: 12.3, contextWindow: 200_000, autoCompactEnabled: false });
		assert.equal(stripAnsi(renderSegment("context_pct", ctx).content), "12.3%/200k");
	});

	it("appends the (auto) indicator when auto-compaction is enabled", () => {
		const ctx = makeCtx({ contextPercent: 12.3, contextWindow: 200_000, autoCompactEnabled: true });
		assert.equal(stripAnsi(renderSegment("context_pct", ctx).content), "12.3%/200k (auto)");
	});

	it("renders ? for the percent when it is null", () => {
		const ctx = makeCtx({ contextPercent: null, contextWindow: 200_000 });
		assert.equal(stripAnsi(renderSegment("context_pct", ctx).content), "?/200k");
	});
});

describe("context_total segment", () => {
	it("is hidden when the context window is 0", () => {
		const ctx = makeCtx({ contextWindow: 0 });
		assert.deepEqual(renderSegment("context_total", ctx), { content: "", visible: false });
	});

	it("renders the formatted window size", () => {
		const ctx = makeCtx({ contextWindow: 200_000 });
		assert.equal(stripAnsi(renderSegment("context_total", ctx).content), "200k");
	});
});

describe("token_in / token_out segments", () => {
	it("token_in is hidden when input is 0", () => {
		assert.deepEqual(renderSegment("token_in", makeCtx({ usageStats: { input: 0, output: 0 } })), {
			content: "",
			visible: false,
		});
	});

	it("token_in renders the formatted input with an up arrow", () => {
		assert.equal(
			stripAnsi(renderSegment("token_in", makeCtx({ usageStats: { input: 1_234, output: 0 } })).content),
			"↑1.2k",
		);
	});

	it("token_out is hidden when output is 0", () => {
		assert.deepEqual(renderSegment("token_out", makeCtx({ usageStats: { input: 0, output: 0 } })), {
			content: "",
			visible: false,
		});
	});

	it("token_out renders the formatted output with a down arrow", () => {
		assert.equal(
			stripAnsi(renderSegment("token_out", makeCtx({ usageStats: { input: 0, output: 6_789 } })).content),
			"↓6.8k",
		);
	});
});

describe("session_name segment", () => {
	it("is hidden when the name is empty", () => {
		const ctx = makeCtx({ session: makeSession({ sessionName: "" }) });
		assert.deepEqual(renderSegment("session_name", ctx), { content: "", visible: false });
	});

	it("renders the session name", () => {
		const ctx = makeCtx({ session: makeSession({ sessionName: "my-session" }) });
		assert.equal(stripAnsi(renderSegment("session_name", ctx).content), "my-session");
	});

	it("sanitizes ANSI escape sequences and control characters in the name", () => {
		const ctx = makeCtx({ session: makeSession({ sessionName: "\x1b[31mred\x1b[0m\x07name" }) });
		// ANSI stripped + BEL (0x07) replaced with a space, then collapsed/trimmed.
		assert.equal(stripAnsi(renderSegment("session_name", ctx).content), "red name");
	});
});

describe("subagents segment", () => {
	it("is hidden when the count is 0", () => {
		assert.deepEqual(renderSegment("subagents", makeCtx({ subagentCount: 0 })), { content: "", visible: false });
	});

	it("renders the count with the ↳ prefix when > 0", () => {
		assert.equal(stripAnsi(renderSegment("subagents", makeCtx({ subagentCount: 3 })).content), "↳3");
	});
});

describe("path segment", () => {
	it("abbreviates the home directory to ~", () => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "/home/user";
		const ctx = makeCtx({ session: makeSession({ cwd: `${home}/project` }) });
		assert.equal(stripAnsi(renderSegment("path", ctx).content), "~/project");
	});

	it("truncates a long path with a leading ellipsis to maxLength", () => {
		const long = "/tmp/very-long-directory-name-that-exceeds-the-limit";
		const ctx = makeCtx({
			session: makeSession({ cwd: long }),
			options: { path: { abbreviate: true, maxLength: 10, stripWorkPrefix: false } },
		});
		const text = stripAnsi(renderSegment("path", ctx).content);
		assert.equal(text.startsWith("…"), true);
		assert.ok(visibleWidth(text) <= 10);
	});

	it("honors abbreviate=false for home-directory paths", () => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "/home/user";
		const ctx = makeCtx({
			session: makeSession({ cwd: `${home}/project` }),
			options: { path: { abbreviate: false, maxLength: 200 } },
		});
		assert.equal(stripAnsi(renderSegment("path", ctx).content), `${home}/project`);
	});
});

describe("formatCwdForFooter", () => {
	it("does not abbreviate sibling paths that share the home prefix", () => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "/home/user";
		assert.equal(formatCwdForFooter(`${home}2`, home), `${home}2`);
	});

	it("abbreviates the home directory and descendants", () => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "/home/user";
		assert.equal(formatCwdForFooter(home, home), "~");
		assert.equal(formatCwdForFooter(`${home}/project`, home), "~/project");
	});
});

describe("formatTokens", () => {
	it("formats raw counts under 1k as-is", () => {
		assert.equal(formatTokens(0), "0");
		assert.equal(formatTokens(999), "999");
	});

	it("formats 1k-10k with one decimal", () => {
		assert.equal(formatTokens(1_234), "1.2k");
	});

	it("formats 10k-1M rounded", () => {
		assert.equal(formatTokens(12_345), "12k");
		assert.equal(formatTokens(200_000), "200k");
	});
});

describe("sanitizeStatusText", () => {
	it("strips ANSI escape sequences", () => {
		assert.equal(sanitizeStatusText("\x1b[31mred\x1b[0m"), "red");
	});

	it("replaces C0 control characters (including BEL) with a space", () => {
		assert.equal(sanitizeStatusText("a\x07b"), "a b");
	});

	it("collapses runs of spaces and trims", () => {
		assert.equal(sanitizeStatusText("  a   b  "), "a b");
	});

	it("strips a raw escape that survives the first pass via the C0 fallback", () => {
		// Lone ESC (0x1b) with no CSI tail is not matched by the ANSI pattern but
		// is caught by the C0 control pattern.
		assert.equal(sanitizeStatusText("a\x1bb"), "a b");
	});
});

describe("computeUsageStats", () => {
	it("sums input/output across assistant messages only", () => {
		const session = makeSession({
			entries: [
				{ type: "message", message: { role: "assistant", usage: { input: 100, output: 200 } } },
				{ type: "message", message: { role: "user", usage: { input: 999, output: 999 } } },
				{ type: "message", message: { role: "assistant", usage: { input: 5, output: 7 } } },
			],
		}) as unknown as SegmentContext["session"];
		assert.deepEqual(computeUsageStats(session), { input: 105, output: 207 });
	});

	it("returns zeros when there are no assistant messages", () => {
		const session = makeSession({ entries: [] }) as unknown as SegmentContext["session"];
		assert.deepEqual(computeUsageStats(session), { input: 0, output: 0 });
	});
});
