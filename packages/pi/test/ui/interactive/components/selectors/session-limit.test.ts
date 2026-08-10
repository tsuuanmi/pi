import { initTheme, setKeybindings } from "@tsuuanmi/pi-tui";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionInfo } from "#pi/session/types";
import { KeybindingsManager } from "#pi/settings/keybindings";
import { SessionSelectorComponent } from "#pi/ui/interactive/components/selectors/session";

function stripAnsi(text: string): string {
	return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

async function flushPromises(): Promise<void> {
	await new Promise<void>((resolve) => {
		setImmediate(resolve);
	});
}

function makeSession(index: number): SessionInfo {
	return {
		path: `/tmp/session-${index}.jsonl`,
		id: `session-${index}`,
		cwd: "/tmp",
		created: new Date(2026, 0, 1),
		modified: new Date(2026, 0, 1, index),
		messageCount: 1,
		firstMessage: index === 0 ? "oldest-session" : `message-${index}`,
		allMessagesText: index === 0 ? "oldest-session" : `message-${index}`,
	};
}

describe("session selector result limit", () => {
	const keybindings = new KeybindingsManager();

	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	it("loads 50 sessions initially and can load the next page", async () => {
		const sessions = Array.from({ length: 55 }, (_, index) => makeSession(index));
		const selector = new SessionSelectorComponent(
			async (_onProgress, offset = 0) =>
				offset === 0
					? { sessions: sessions.slice(5), hasMore: true, nextOffset: 50 }
					: { sessions: sessions.slice(0, 5), hasMore: false, nextOffset: 55 },
			async () => [],
			() => {},
			() => {},
			() => {},
			() => {},
			{ keybindings },
		);
		await flushPromises();

		const latestRendered = stripAnsi(selector.render(120).join("\n"));
		expect(latestRendered).toContain("message-54");
		expect(latestRendered).toContain("(1/51)");

		for (const character of "oldest-session") {
			selector.getSessionList().handleInput(character);
		}

		const oldRendered = stripAnsi(selector.render(120).join("\n"));
		expect(oldRendered).toContain("No loaded sessions match");
		expect(oldRendered).toContain("Load 50 more sessions");

		selector.getSessionList().handleInput("\r");
		await flushPromises();
		const loadedRendered = stripAnsi(selector.render(120).join("\n"));
		expect(loadedRendered).toContain("oldest-session");
	});
});
