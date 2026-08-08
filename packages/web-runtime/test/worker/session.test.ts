import { beforeEach, describe, expect, test, vi } from "vitest";
import type { WebProviderDescriptor } from "../../src/types.ts";
import type { WorkerTurn } from "../../src/worker/protocol.ts";

const mocks = vi.hoisted(() => ({ open: vi.fn(), mcpOpen: vi.fn() }));
vi.mock("../../src/session.ts", () => ({ BrowserSession: { open: mocks.open } }));
vi.mock("../../src/mcp/client.ts", () => ({ McpClientSession: { open: mocks.mcpOpen } }));

import { WorkerSession } from "../../src/worker/session.ts";

const turn: WorkerTurn = {
	id: "turn-1",
	provider: "test",
	model: "model",
	prompt: "prompt",
	attachments: [],
	tools: [],
	capability: "capability",
};

function descriptor(runTurn: WebProviderDescriptor["runTurn"]): WebProviderDescriptor {
	return {
		id: "test",
		name: "Test",
		models: [],
		worker: "./worker",
		verify: async () => ({ routes: [] }),
		runTurn,
	};
}

function mcp() {
	return {
		bind_turn: vi.fn(),
		list_tools: vi.fn(async () => []),
		call_tool: vi.fn(async () => undefined),
		close: vi.fn(async () => {}),
	};
}

describe("WorkerSession", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.mcpOpen.mockResolvedValue(mcp());
	});

	test("passes one owned page to the descriptor and closes it", async () => {
		const page = {};
		const closeTurn = vi.fn(async () => {});
		const browser = { openTurn: vi.fn(async () => page), closeTurn, close: vi.fn(async () => {}) };
		mocks.open.mockResolvedValue(browser);
		const received: unknown[] = [];
		const session = await WorkerSession.open(
			"/profile",
			descriptor(async (value) => {
				received.push(value.page);
			}),
		);

		await session.run(turn, (message) => received.push(message));
		expect(received[0]).toBe(page);
		expect(closeTurn).toHaveBeenCalledWith("turn-1");
	});

	test("cancels only the active turn", async () => {
		const browser = {
			openTurn: vi.fn(async () => ({})),
			closeTurn: vi.fn(async () => {}),
			close: vi.fn(async () => {}),
		};
		mocks.open.mockResolvedValue(browser);
		const session = await WorkerSession.open(
			"/profile",
			descriptor(async (value) => {
				await new Promise<void>((_resolve, reject) => {
					value.signal.addEventListener("abort", () => reject(value.signal.reason), { once: true });
				});
			}),
		);
		const running = session.run(turn, () => {});
		await Promise.resolve();
		session.cancel("turn-1");
		await expect(running).rejects.toThrow("turn canceled");
		expect(browser.closeTurn).toHaveBeenCalledWith("turn-1");
	});
});
