import { visibleWidth } from "@tsuuanmi/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";
import type { AgentSession } from "../src/core/agent-session.ts";
import {
	computeUsageStats,
	formatCwdForFooter,
	formatTokens,
	renderSegment,
	sanitizeStatusText,
} from "../src/modes/interactive/components/status-line/segments.ts";
import type { SegmentContext } from "../src/modes/interactive/components/status-line/types.ts";
import { initTheme } from "../src/theme/theme.ts";
import { stripAnsi } from "../src/utils/terminal/ansi.ts";

beforeAll(() => {
	initTheme("dark");
});

function makeSession(overrides?: {
	model?: Partial<{ id: string; name: string; provider: string; reasoning: boolean; contextWindow: number }>;
	thinkingLevel?: string;
	cwd?: string;
	sessionName?: string;
	entries?: unknown[];
}): AgentSession {
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
	} as unknown as AgentSession;
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
		expect(stripAnsi(renderSegment("model", ctx).content)).toBe("Claude X");
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
		expect(text).toContain("M");
		expect(text).toContain("high");
	});

	it("omits the thinking level when it is off", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: { id: "m", name: "M", provider: "p", reasoning: true, contextWindow: 200_000 },
				thinkingLevel: "off",
			}),
			options: { model: { showThinkingLevel: true } },
		});
		expect(stripAnsi(renderSegment("model", ctx).content)).toBe("M");
	});

	it("omits the thinking level when showThinkingLevel is false even if reasoning + high", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: { id: "m", name: "M", provider: "p", reasoning: true, contextWindow: 200_000 },
				thinkingLevel: "high",
			}),
			options: { model: { showThinkingLevel: false } },
		});
		expect(stripAnsi(renderSegment("model", ctx).content)).toBe("M");
	});

	it("shows the (provider) prefix when more than one provider is available", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: { id: "m", name: "M", provider: "anthropic", reasoning: false, contextWindow: 200_000 },
			}),
			availableProviderCount: 2,
			options: { model: { showProviderPrefix: true } },
		});
		expect(stripAnsi(renderSegment("model", ctx).content)).toBe("(anthropic) M");
	});

	it("omits the (provider) prefix when only one provider is available", () => {
		const ctx = makeCtx({
			session: makeSession({
				model: { id: "m", name: "M", provider: "anthropic", reasoning: false, contextWindow: 200_000 },
			}),
			availableProviderCount: 1,
			options: { model: { showProviderPrefix: true } },
		});
		expect(stripAnsi(renderSegment("model", ctx).content)).toBe("M");
	});
});

describe("mode segment", () => {
	it("is hidden when no workflow phase is active", () => {
		const ctx = makeCtx({ workflowPhase: undefined });
		expect(renderSegment("mode", ctx)).toEqual({ content: "", visible: false });
	});

	it("renders the active workflow phase", () => {
		const ctx = makeCtx({ workflowPhase: "planner" });
		expect(stripAnsi(renderSegment("mode", ctx).content)).toBe("planner");
	});
});

describe("git segment", () => {
	it("is hidden when neither branch nor status is available (non-git cwd)", () => {
		const ctx = makeCtx({ git: { branch: null, status: null } });
		expect(renderSegment("git", ctx)).toEqual({ content: "", visible: false });
	});

	it("renders a clean branch with the dim color", () => {
		const ctx = makeCtx({ git: { branch: "main", status: { staged: 0, unstaged: 0, untracked: 0 } } });
		const rendered = renderSegment("git", ctx);
		expect(rendered.visible).toBe(true);
		expect(stripAnsi(rendered.content)).toBe("main");
	});

	it("renders dirty indicators (*unstaged +staged ?untracked)", () => {
		const ctx = makeCtx({
			git: { branch: "main", status: { staged: 2, unstaged: 3, untracked: 1 } },
			options: { git: { showBranch: true, showStaged: true, showUnstaged: true, showUntracked: true } },
		});
		expect(stripAnsi(renderSegment("git", ctx).content)).toBe("main *3 +2 ?1");
	});

	it("respects showUntracked: false", () => {
		const ctx = makeCtx({
			git: { branch: "main", status: { staged: 0, unstaged: 0, untracked: 5 } },
			options: { git: { showUntracked: false } },
		});
		expect(stripAnsi(renderSegment("git", ctx).content)).toBe("main");
	});
});

describe("context_pct segment", () => {
	it("renders a known percent and window", () => {
		const ctx = makeCtx({ contextPercent: 12.3, contextWindow: 200_000, autoCompactEnabled: false });
		expect(stripAnsi(renderSegment("context_pct", ctx).content)).toBe("12.3%/200k");
	});

	it("appends the (auto) indicator when auto-compaction is enabled", () => {
		const ctx = makeCtx({ contextPercent: 12.3, contextWindow: 200_000, autoCompactEnabled: true });
		expect(stripAnsi(renderSegment("context_pct", ctx).content)).toBe("12.3%/200k (auto)");
	});

	it("renders ? for the percent when it is null", () => {
		const ctx = makeCtx({ contextPercent: null, contextWindow: 200_000 });
		expect(stripAnsi(renderSegment("context_pct", ctx).content)).toBe("?/200k");
	});
});

describe("context_total segment", () => {
	it("is hidden when the context window is 0", () => {
		const ctx = makeCtx({ contextWindow: 0 });
		expect(renderSegment("context_total", ctx)).toEqual({ content: "", visible: false });
	});

	it("renders the formatted window size", () => {
		const ctx = makeCtx({ contextWindow: 200_000 });
		expect(stripAnsi(renderSegment("context_total", ctx).content)).toBe("200k");
	});
});

describe("token_in / token_out segments", () => {
	it("token_in is hidden when input is 0", () => {
		expect(renderSegment("token_in", makeCtx({ usageStats: { input: 0, output: 0 } }))).toEqual({
			content: "",
			visible: false,
		});
	});

	it("token_in renders the formatted input with an up arrow", () => {
		expect(stripAnsi(renderSegment("token_in", makeCtx({ usageStats: { input: 1_234, output: 0 } })).content)).toBe(
			"↑1.2k",
		);
	});

	it("token_out is hidden when output is 0", () => {
		expect(renderSegment("token_out", makeCtx({ usageStats: { input: 0, output: 0 } }))).toEqual({
			content: "",
			visible: false,
		});
	});

	it("token_out renders the formatted output with a down arrow", () => {
		expect(stripAnsi(renderSegment("token_out", makeCtx({ usageStats: { input: 0, output: 6_789 } })).content)).toBe(
			"↓6.8k",
		);
	});
});

describe("session_name segment", () => {
	it("is hidden when the name is empty", () => {
		const ctx = makeCtx({ session: makeSession({ sessionName: "" }) });
		expect(renderSegment("session_name", ctx)).toEqual({ content: "", visible: false });
	});

	it("renders the session name", () => {
		const ctx = makeCtx({ session: makeSession({ sessionName: "my-session" }) });
		expect(stripAnsi(renderSegment("session_name", ctx).content)).toBe("my-session");
	});

	it("sanitizes ANSI escape sequences and control characters in the name", () => {
		const ctx = makeCtx({ session: makeSession({ sessionName: "\x1b[31mred\x1b[0m\x07name" }) });
		// ANSI stripped + BEL (0x07) replaced with a space, then collapsed/trimmed.
		expect(stripAnsi(renderSegment("session_name", ctx).content)).toBe("red name");
	});
});

describe("subagents segment", () => {
	it("is hidden when the count is 0", () => {
		expect(renderSegment("subagents", makeCtx({ subagentCount: 0 }))).toEqual({ content: "", visible: false });
	});

	it("renders the count with the ↳ prefix when > 0", () => {
		expect(stripAnsi(renderSegment("subagents", makeCtx({ subagentCount: 3 })).content)).toBe("↳3");
	});
});

describe("path segment", () => {
	it("abbreviates the home directory to ~", () => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "/home/user";
		const ctx = makeCtx({ session: makeSession({ cwd: `${home}/project` }) });
		expect(stripAnsi(renderSegment("path", ctx).content)).toBe("~/project");
	});

	it("truncates a long path with a leading ellipsis to maxLength", () => {
		const long = "/tmp/very-long-directory-name-that-exceeds-the-limit";
		const ctx = makeCtx({
			session: makeSession({ cwd: long }),
			options: { path: { abbreviate: true, maxLength: 10, stripWorkPrefix: false } },
		});
		const text = stripAnsi(renderSegment("path", ctx).content);
		expect(text.startsWith("…")).toBe(true);
		expect(visibleWidth(text)).toBeLessThanOrEqual(10);
	});

	it("honors abbreviate=false for home-directory paths", () => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "/home/user";
		const ctx = makeCtx({
			session: makeSession({ cwd: `${home}/project` }),
			options: { path: { abbreviate: false, maxLength: 200 } },
		});
		expect(stripAnsi(renderSegment("path", ctx).content)).toBe(`${home}/project`);
	});
});

describe("formatCwdForFooter", () => {
	it("does not abbreviate sibling paths that share the home prefix", () => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "/home/user";
		expect(formatCwdForFooter(`${home}2`, home)).toBe(`${home}2`);
	});

	it("abbreviates the home directory and descendants", () => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "/home/user";
		expect(formatCwdForFooter(home, home)).toBe("~");
		expect(formatCwdForFooter(`${home}/project`, home)).toBe("~/project");
	});
});

describe("formatTokens", () => {
	it("formats raw counts under 1k as-is", () => {
		expect(formatTokens(0)).toBe("0");
		expect(formatTokens(999)).toBe("999");
	});

	it("formats 1k-10k with one decimal", () => {
		expect(formatTokens(1_234)).toBe("1.2k");
	});

	it("formats 10k-1M rounded", () => {
		expect(formatTokens(12_345)).toBe("12k");
		expect(formatTokens(200_000)).toBe("200k");
	});
});

describe("sanitizeStatusText", () => {
	it("strips ANSI escape sequences", () => {
		expect(sanitizeStatusText("\x1b[31mred\x1b[0m")).toBe("red");
	});

	it("replaces C0 control characters (including BEL) with a space", () => {
		expect(sanitizeStatusText("a\x07b")).toBe("a b");
	});

	it("collapses runs of spaces and trims", () => {
		expect(sanitizeStatusText("  a   b  ")).toBe("a b");
	});

	it("strips a raw escape that survives the first pass via the C0 fallback", () => {
		// Lone ESC (0x1b) with no CSI tail is not matched by the ANSI pattern but
		// is caught by the C0 control pattern.
		expect(sanitizeStatusText("a\x1bb")).toBe("a b");
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
		expect(computeUsageStats(session)).toEqual({ input: 105, output: 207 });
	});

	it("returns zeros when there are no assistant messages", () => {
		const session = makeSession({ entries: [] }) as unknown as SegmentContext["session"];
		expect(computeUsageStats(session)).toEqual({ input: 0, output: 0 });
	});
});
