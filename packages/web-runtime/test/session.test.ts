import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	acquire: vi.fn(),
	launch: vi.fn(),
}));

vi.mock("../src/profiles.ts", () => ({ acquireProfile: mocks.acquire }));
vi.mock("../src/chromium.ts", () => ({ launchVisibleChromium: mocks.launch }));

import { BrowserSession } from "../src/session.ts";

function context(log: string[]): {
	newPage: () => Promise<{ close: () => Promise<void> }>;
	close: () => Promise<void>;
} {
	return {
		newPage: async () => ({
			close: async () => {
				log.push("page");
			},
		}),
		close: async () => {
			log.push("context");
		},
	};
}

describe("BrowserSession", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	test("limits a profile to five turn pages", async () => {
		const log: string[] = [];
		const release = vi.fn(() => log.push("lease"));
		mocks.acquire.mockReturnValue({ path: "/profile", release });
		mocks.launch.mockResolvedValue(context(log));
		const session = await BrowserSession.open("/profile");

		for (let index = 0; index < 5; index += 1) await session.openTurn(`turn-${index}`);
		await expect(session.openTurn("turn-5")).rejects.toThrow("tab limit");
		await session.close();
		await session.close();
		expect(log.at(-2)).toBe("context");
		expect(log.at(-1)).toBe("lease");
	});

	test("reserves slots across concurrent page creation", async () => {
		let releaseGate = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		mocks.acquire.mockReturnValue({ path: "/profile", release: vi.fn() });
		mocks.launch.mockResolvedValue({
			newPage: async () => {
				await gate;
				return { close: async () => {} };
			},
			close: async () => {},
		});
		const session = await BrowserSession.open("/profile");
		const openings = Array.from({ length: 5 }, (_, index) => session.openTurn(`turn-${index}`));
		await expect(session.openTurn("turn-5")).rejects.toThrow("tab limit");
		releaseGate();
		await Promise.all(openings);
		await session.close();
	});

	test("waits for page creation before releasing the profile", async () => {
		let releaseGate = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		const log: string[] = [];
		mocks.acquire.mockReturnValue({ path: "/profile", release: () => log.push("lease") });
		mocks.launch.mockResolvedValue({
			newPage: async () => {
				await gate;
				return { close: async () => log.push("page") };
			},
			close: async () => log.push("context"),
		});
		const session = await BrowserSession.open("/profile");
		const opening = session.openTurn("turn");
		const closing = session.close();
		releaseGate();
		await expect(opening).rejects.toThrow("browser session is closed");
		await closing;
		expect(log).toEqual(["page", "context", "lease"]);
	});

	test("closes only the requested turn page", async () => {
		const log: string[] = [];
		mocks.acquire.mockReturnValue({ path: "/profile", release: () => log.push("lease") });
		mocks.launch.mockResolvedValue(context(log));
		const session = await BrowserSession.open("/profile");
		await session.openTurn("one");
		await session.openTurn("two");

		await session.closeTurn("one");
		expect(log).toEqual(["page"]);
		await session.close();
		expect(log).toEqual(["page", "page", "context", "lease"]);
	});

	test("releases the profile lease when launch fails", async () => {
		const release = vi.fn();
		mocks.acquire.mockReturnValue({ path: "/profile", release });
		mocks.launch.mockRejectedValue(new Error("launch failed"));

		await expect(BrowserSession.open("/profile")).rejects.toThrow("could not be opened");
		expect(release).toHaveBeenCalledOnce();
	});
});
