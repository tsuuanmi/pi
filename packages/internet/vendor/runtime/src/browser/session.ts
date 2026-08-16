import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export interface BrowserSessionOptions {
  executablePath: string;
  storageStatePath: string;
  viewport: { width: number; height: number };
  headless: boolean;
  args?: string[];
  assertReady: () => void;
}

/** Owns browser processes, contexts, pages, and deterministic cleanup for one provider session. */
export class BrowserSession {
  private singleBrowser?: Browser;
  private singleContext?: BrowserContext;
  private singlePage?: Page;
  private managedBrowser?: Browser;
  private managedContext?: BrowserContext;
  private managedBrowserReady?: Promise<{ browser: Browser; context: BrowserContext }>;
  private readonly managedPages = new Map<string, Page>();

  constructor(private readonly options: BrowserSessionOptions) {}

  async ensurePage(): Promise<Page> {
    if (this.singlePage && !this.singlePage.isClosed()) return this.singlePage;

    const { browser, context } = await this.launch();
    const page = await context.newPage();
    this.singleBrowser = browser;
    this.singleContext = context;
    this.singlePage = page;
    this.watchBrowser(browser, () => {
      if (this.singleBrowser !== browser) return;
      this.singleBrowser = undefined;
      this.singleContext = undefined;
      this.singlePage = undefined;
    });
    return page;
  }

  async pageForKey(key: string, maxPages: number): Promise<Page> {
    if (!Number.isInteger(maxPages) || maxPages < 1) {
      throw new Error("Browser page capacity must be a positive integer");
    }

    const cached = this.managedPages.get(key);
    if (cached && !cached.isClosed()) {
      this.managedPages.delete(key);
      this.managedPages.set(key, cached);
      return cached;
    }
    this.managedPages.delete(key);

    if (this.managedPages.size >= maxPages) {
      const oldest = this.managedPages.entries().next().value as [string, Page] | undefined;
      if (oldest) {
        this.managedPages.delete(oldest[0]);
        await oldest[1].close().catch(() => {});
      }
    }

    const { context } = await this.ensureManagedBrowser();
    const page = await context.newPage();
    this.managedPages.set(key, page);
    return page;
  }

  async closePage(key: string): Promise<void> {
    const page = this.managedPages.get(key);
    this.managedPages.delete(key);
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }

  async storageState(): Promise<Awaited<ReturnType<BrowserContext["storageState"]>>> {
    const { context } = await this.ensureManagedBrowser();
    return context.storageState();
  }

  async close(): Promise<void> {
    const browsers = new Set<Browser>();
    if (this.singleBrowser) browsers.add(this.singleBrowser);
    if (this.managedBrowser) browsers.add(this.managedBrowser);
    this.singleBrowser = undefined;
    this.singleContext = undefined;
    this.singlePage = undefined;
    this.managedBrowser = undefined;
    this.managedContext = undefined;
    this.managedBrowserReady = undefined;
    this.managedPages.clear();
    await Promise.all([...browsers].map(browser => browser.close()));
  }

  private async ensureManagedBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
    if (this.managedBrowserReady) {
      const cached = await this.managedBrowserReady;
      if (cached.browser.isConnected()) return cached;
      this.managedBrowserReady = undefined;
      this.managedBrowser = undefined;
      this.managedContext = undefined;
      this.managedPages.clear();
    }

    const opening = this.launch();
    this.managedBrowserReady = opening;
    try {
      const managed = await opening;
      this.managedBrowser = managed.browser;
      this.managedContext = managed.context;
      this.watchBrowser(managed.browser, () => {
        if (this.managedBrowserReady === opening) this.managedBrowserReady = undefined;
        if (this.managedBrowser === managed.browser) this.managedBrowser = undefined;
        if (this.managedContext === managed.context) this.managedContext = undefined;
        this.managedPages.clear();
      });
      return managed;
    } catch (error) {
      if (this.managedBrowserReady === opening) this.managedBrowserReady = undefined;
      throw error;
    }
  }

  private async launch(): Promise<{ browser: Browser; context: BrowserContext }> {
    this.options.assertReady();
    const browser = await chromium.launch({
      executablePath: this.options.executablePath,
      headless: this.options.headless,
      args: this.options.args,
    });
    const context = await browser.newContext({
      storageState: this.options.storageStatePath,
      viewport: this.options.viewport,
    });
    return { browser, context };
  }

  private watchBrowser(browser: Browser, onDisconnected: () => void): void {
    browser.once("disconnected", onDisconnected);
  }
}
