import type { Browser, BrowserContext, LaunchOptions, Page } from "playwright-core";

import { BrowserSession } from "#runtime/browser/session";

const launch = vi.fn<(options: LaunchOptions) => Promise<Browser>>();

interface FakePage {
	page: Page;
	close: ReturnType<typeof vi.fn>;
}

function fakePage(): FakePage {
	let closed = false;
	const close = vi.fn(async () => {
		closed = true;
	});
	return {
		page: { close, isClosed: () => closed } as unknown as Page,
		close,
	};
}

function fakeBrowser(pages: FakePage[] = []) {
	const context = {
		newPage: vi.fn(async () => {
			const created = fakePage();
			pages.push(created);
			return created.page;
		}),
		storageState: vi.fn(async () => ({ cookies: [], origins: [] })),
	} as unknown as BrowserContext;
	const close = vi.fn(async () => {});
	const browser = {
		isConnected: () => true,
		newContext: vi.fn(async () => context),
		on: vi.fn(),
		close,
	} as unknown as Browser;
	return { browser, close, context };
}

function session(): BrowserSession {
	return new BrowserSession(
		{
			executablePath: "/chrome",
			storageStatePath: "/storage.json",
			viewport: { width: 800, height: 600 },
			headless: true,
			args: [],
			assertReady: () => {},
		},
		launch,
	);
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("BrowserSession", () => {
	beforeEach(() => {
		launch.mockReset();
	});

	it("uses one browser and context for maintenance and managed pages", async () => {
		const launched = fakeBrowser();
		launch.mockResolvedValue(launched.browser);
		const browserSession = session();

		await browserSession.ensurePage();
		const lease = await browserSession.acquirePage("conversation", 2);
		await lease.release();

		expect(launch).toHaveBeenCalledOnce();
		expect(launched.browser.newContext).toHaveBeenCalledOnce();
		expect(launched.context.newPage).toHaveBeenCalledTimes(2);
		await browserSession.close();
	});

	it("never evicts a leased page when capacity is exhausted", async () => {
		const pages: FakePage[] = [];
		launch.mockResolvedValue(fakeBrowser(pages).browser);
		const browserSession = session();
		const first = await browserSession.acquirePage("first", 1);

		await expect(browserSession.acquirePage("second", 1)).rejects.toThrow("fully leased");
		expect(pages[0]?.close).not.toHaveBeenCalled();
		await first.release();
		const second = await browserSession.acquirePage("second", 1);
		expect(pages[0]?.close).toHaveBeenCalledOnce();
		await second.release();
		await browserSession.close();
	});

	it("closes a browser whose launch completes during shutdown", async () => {
		const launched = fakeBrowser();
		const pendingLaunch = deferred<Browser>();
		launch.mockReturnValue(pendingLaunch.promise);
		const browserSession = session();
		const pendingPage = browserSession.ensurePage();
		await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
		const closing = browserSession.close();
		pendingLaunch.resolve(launched.browser);

		await expect(pendingPage).rejects.toThrow("session is closing");
		await closing;
		expect(launched.close).toHaveBeenCalledOnce();
	});
});
