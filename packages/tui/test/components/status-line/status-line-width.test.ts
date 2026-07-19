import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, before, describe, it } from "node:test";
import {
	initTheme,
	StatusLineComponent,
	type StatusLineDataProvider,
	type StatusLineSessionLike,
	type StatusLineSettings,
	type StatusLineWorkflowEntry,
	stripAnsi,
	visibleWidth,
} from "#tui/index";

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

before(() => {
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
}): StatusLineSessionLike {
	const usage = options.usage ?? null;
	const entries = usage == null ? [] : [{ type: "message", message: { role: "assistant", usage } }];
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
			getCwd: () => options.cwd ?? "/nonexistent-pi-status-line-test-cwd",
		},
		sessionId: options.sessionId ?? "status-line-test-session",
		getContextUsage: () => ({ contextWindow: options.contextWindow ?? 200_000, percent: 12.3 }),
		subagentManager: { getActiveCount: () => options.subagentCount ?? 0 },
	};
}

function createFooterData(providerCount: number): StatusLineDataProvider {
	return {
		getGitBranch: () => "main",
		getExtensionStatuses: () => new Map<string, string>(),
		getAvailableProviderCount: () => providerCount,
	};
}

function createSettings(settings: StatusLineSettings = {}): { getStatusLine(): StatusLineSettings } {
	return { getStatusLine: () => settings };
}

function makeWorkflowReader(entriesBySession: Map<string, StatusLineWorkflowEntry[]> = new Map()) {
	return async ({ sessionId }: { cwd: string; sessionId: string }) => entriesBySession.get(sessionId) ?? [];
}

function makeComponent(
	session: StatusLineSessionLike,
	providerCount = 1,
	settings: StatusLineSettings = {},
	requestRender = () => {},
	entriesBySession: Map<string, StatusLineWorkflowEntry[]> = new Map(),
): StatusLineComponent {
	return new StatusLineComponent(session, createFooterData(providerCount), createSettings(settings), requestRender, {
		readWorkflowEntries: makeWorkflowReader(entriesBySession),
	});
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
		assert.ok(lines.length >= 1);
		for (const line of lines) assert.ok(visibleWidth(line) <= width);
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
		for (const line of footer.render(width)) assert.ok(visibleWidth(line) <= width);
	});

	it("still keeps lines within width on an extremely narrow terminal", () => {
		const session = createSession({ sessionName: "x".repeat(40), usage: { input: 1, output: 2 } });
		const footer = makeComponent(session, 2);
		for (const line of footer.render(8)) assert.ok(visibleWidth(line) <= 8);
	});
});

describe("StatusLineComponent provider-prefix width fallback", () => {
	it("shows the (provider) prefix on a wide terminal", () => {
		const session = createSession({ sessionName: "", modelName: "Claude", provider: "anthropic" });
		const footer = makeComponent(session, 2);
		const rail = stripAnsi(footer.render(120).at(-1) ?? "");
		assert.match(rail, new RegExp(escapeRegExp("(anthropic) Claude")));
	});

	it("drops the (provider) prefix on a narrow terminal", () => {
		const session = createSession({ sessionName: "", modelName: "Claude", provider: "anthropic" });
		const footer = makeComponent(session, 2);
		const rail = stripAnsi(footer.render(20).at(-1) ?? "");
		assert.doesNotMatch(rail, new RegExp(escapeRegExp("(anthropic)")));
	});
});

describe("StatusLineComponent workflow HUD cache", () => {
	it("reads active workflows scoped to the current session", async () => {
		const cwd = await makeTempCwd();
		const workflows = new Map<string, StatusLineWorkflowEntry[]>([
			["foreign-session", [{ skill: "ralplan", active: true, phase: "foreign" }]],
			["my-session", [{ skill: "team", active: true, phase: "mine" }]],
		]);

		const footer = makeComponent(
			createSession({ sessionName: "", cwd, sessionId: "my-session" }),
			1,
			{},
			() => {},
			workflows,
		);
		const lines = await waitForRender(footer, 120, (rendered) =>
			stripAnsi(rendered.join("\n")).includes("team:mine"),
		);
		const text = stripAnsi(lines.join("\n"));

		assert.match(text, new RegExp(escapeRegExp("team:mine")));
		assert.doesNotMatch(text, new RegExp(escapeRegExp("ralplan:foreign")));
		assert.doesNotMatch(text, new RegExp(escapeRegExp("foreign")));
	});

	it("collapses the cached planning pipeline before deriving the mode segment", async () => {
		const cwd = await makeTempCwd();
		const workflows = new Map<string, StatusLineWorkflowEntry[]>([
			[
				"status-line-test-session",
				[
					{
						skill: "deep-interview",
						active: true,
						phase: "interview",
						updated_at: "2026-06-21T00:00:00.000Z",
					},
					{
						skill: "ultragoal",
						active: true,
						phase: "execute",
						updated_at: "2026-06-21T00:00:01.000Z",
					},
				],
			],
		]);

		const footer = makeComponent(createSession({ sessionName: "", cwd }), 1, {}, () => {}, workflows);
		const lines = await waitForRender(footer, 120, (rendered) =>
			stripAnsi(rendered.join("\n")).includes("ultragoal:execute"),
		);
		const [hudLine, railLine] = lines.map((line) => stripAnsi(line));

		assert.match(hudLine, new RegExp(escapeRegExp("ultragoal:execute")));
		assert.doesNotMatch(hudLine, new RegExp(escapeRegExp("deep-interview:interview")));
		assert.match(railLine, new RegExp(escapeRegExp("execute")));
		assert.doesNotMatch(railLine, new RegExp(escapeRegExp("interview")));
	});
});
