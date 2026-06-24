import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth } from "@tsuuanmi/pi-tui";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AgentSession } from "../../src/core/agent-session/agent-session.ts";
import type { ReadonlyFooterDataProvider } from "../../src/core/misc/footer-data-provider.ts";
import type { SettingsManager, StatusLineSettings } from "../../src/core/settings/settings-manager.ts";
import { StatusLineComponent } from "../../src/modes/interactive/components/status-line/index.ts";
import { initTheme } from "../../src/theme/theme.ts";
import { stripAnsi } from "../../src/utils/terminal/ansi.ts";
import { syncWorkflowActiveState } from "../../src/workflows/shared/active-state.ts";

beforeAll(() => {
	initTheme("dark");
});

const tmpDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

type AssistantUsage = { input: number; output: number };

function createSession(options: {
	sessionName: string;
	cwd?: string;
	modelId?: string;
	modelName?: string;
	provider?: string;
	reasoning?: boolean;
	thinkingLevel?: string;
	contextWindow?: number;
	usage?: AssistantUsage | null;
	subagentCount?: number;
	sessionId?: string;
}): AgentSession {
	const usage = options.usage ?? null;
	const entries =
		usage === null || usage === undefined ? [] : [{ type: "message", message: { role: "assistant", usage } }];
	return {
		state: {
			model: {
				id: options.modelId ?? "test-model",
				name: options.modelName ?? "Test Model",
				provider: options.provider ?? "test",
				contextWindow: options.contextWindow ?? 200_000,
				reasoning: options.reasoning ?? false,
			},
			thinkingLevel: options.thinkingLevel ?? "off",
		},
		sessionManager: {
			getEntries: () => entries,
			getSessionName: () => options.sessionName,
			// Use a non-existent cwd so background git/HUD fetches are no-ops and
			// the test does not pick up the real repo's .pi workflow state.
			getCwd: () => options.cwd ?? "/nonexistent-pi-status-line-test-cwd",
		},
		sessionId: options.sessionId ?? "status-line-test-session",
		getContextUsage: () => ({ contextWindow: options.contextWindow ?? 200_000, percent: 12.3 }),
		subagentManager: { getActiveCount: () => options.subagentCount ?? 0 },
	} as unknown as AgentSession;
}

function createFooterData(providerCount: number): ReadonlyFooterDataProvider {
	return {
		getGitBranch: () => "main",
		getExtensionStatuses: () => new Map<string, string>(),
		getAvailableProviderCount: () => providerCount,
		getCodexUsageSummary: () => null,
		onBranchChange: () => () => {},
	} as unknown as ReadonlyFooterDataProvider;
}

function createSettings(settings: StatusLineSettings = {}): SettingsManager {
	return { getStatusLine: () => settings } as unknown as SettingsManager;
}

function makeComponent(
	session: AgentSession,
	providerCount = 1,
	settings: StatusLineSettings = {},
	requestRender = () => {},
): StatusLineComponent {
	return new StatusLineComponent(session, createFooterData(providerCount), createSettings(settings), requestRender);
}

async function makeTempCwd(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pi-status-line-"));
	tmpDirs.push(dir);
	return dir;
}

async function waitForRender(component: StatusLineComponent, width: number, predicate: (lines: string[]) => boolean) {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const lines = component.render(width);
		if (predicate(lines)) return lines;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	return component.render(width);
}

describe("StatusLineComponent width handling", () => {
	it("keeps all lines within width for wide session names", () => {
		const width = 93;
		const session = createSession({ sessionName: "한글".repeat(30) });
		const footer = makeComponent(session);
		const lines = footer.render(width);
		expect(lines.length).toBeGreaterThanOrEqual(1);
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
	});

	it("keeps the rail within width for a wide model + provider + high thinking", () => {
		const width = 60;
		const session = createSession({
			sessionName: "",
			modelName: "模".repeat(30),
			provider: "공급자",
			reasoning: true,
			thinkingLevel: "high",
			usage: { input: 12_345, output: 6_789 },
		});
		const footer = makeComponent(session, 2);
		const lines = footer.render(width);
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
	});

	it("still keeps lines within width on an extremely narrow terminal", () => {
		const session = createSession({ sessionName: "x".repeat(40), usage: { input: 1, output: 2 } });
		const footer = makeComponent(session, 2);
		for (const line of footer.render(8)) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(8);
		}
	});
});

describe("StatusLineComponent provider-prefix width fallback", () => {
	it("shows the (provider) prefix on a wide terminal", () => {
		const session = createSession({ sessionName: "", modelName: "Claude", provider: "anthropic" });
		const footer = makeComponent(session, 2);
		const rail = stripAnsi(footer.render(120).at(-1) ?? "");
		expect(rail).toContain("(anthropic) Claude");
	});

	it("drops the (provider) prefix on a narrow terminal", () => {
		const session = createSession({ sessionName: "", modelName: "Claude", provider: "anthropic" });
		const footer = makeComponent(session, 2);
		const rail = stripAnsi(footer.render(20).at(-1) ?? "");
		expect(rail).not.toContain("(anthropic)");
	});
});

describe("StatusLineComponent workflow HUD cache", () => {
	it("reads active workflows scoped to the current session", async () => {
		const cwd = await makeTempCwd();
		await syncWorkflowActiveState(
			cwd,
			{ skill: "ralplan", active: true, phase: "foreign" },
			{ sessionId: "foreign-session" },
		);
		await syncWorkflowActiveState(cwd, { skill: "team", active: true, phase: "mine" }, { sessionId: "my-session" });

		const footer = makeComponent(createSession({ sessionName: "", cwd, sessionId: "my-session" }));
		const lines = await waitForRender(footer, 120, (rendered) =>
			stripAnsi(rendered.join("\n")).includes("team:mine"),
		);
		const text = stripAnsi(lines.join("\n"));

		expect(text).toContain("team:mine");
		expect(text).not.toContain("ralplan:foreign");
		expect(text).not.toContain("foreign");
	});

	it("collapses the cached planning pipeline before deriving the mode segment", async () => {
		const cwd = await makeTempCwd();
		await syncWorkflowActiveState(cwd, {
			skill: "deep-interview",
			active: true,
			phase: "interview",
			updated_at: "2026-06-21T00:00:00.000Z",
		});
		await syncWorkflowActiveState(cwd, {
			skill: "ultragoal",
			active: true,
			phase: "execute",
			updated_at: "2026-06-21T00:00:01.000Z",
		});

		const footer = makeComponent(createSession({ sessionName: "", cwd }));
		const lines = await waitForRender(footer, 120, (rendered) =>
			stripAnsi(rendered.join("\n")).includes("ultragoal:execute"),
		);
		const [hudLine, railLine] = lines.map((line) => stripAnsi(line));

		expect(hudLine).toContain("ultragoal:execute");
		expect(hudLine).not.toContain("deep-interview:interview");
		expect(railLine).toContain("execute");
		expect(railLine).not.toContain("interview");
	});
});
