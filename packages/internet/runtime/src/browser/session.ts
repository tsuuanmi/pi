import { chromium, type Browser, type BrowserContext, type LaunchOptions, type Page } from "playwright-core";

export interface BrowserSessionOptions {
  executablePath: string;
  storageStatePath: string;
  viewport: { width: number; height: number };
  headless: boolean;
  args: string[];
  assertReady: () => void;
}

export interface BrowserPageLease {
  page: Page;
  release(options?: { discard?: boolean }): Promise<void>;
}

interface ManagedPage {
  page: Page;
  leases: number;
}

/** Owns one provider-neutral browser process, context, maintenance page, and managed page pool. */
export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private maintenancePage?: Page;
  private launchTask?: Promise<void>;
  private readonly pages = new Map<string, ManagedPage>();
  private operationTail: Promise<void> = Promise.resolve();
  private closePromise?: Promise<void>;
  private closing = false;
  private readonly options: BrowserSessionOptions;
  private readonly launch: (options: LaunchOptions) => Promise<Browser>;

  constructor(
    options: BrowserSessionOptions,
    launch: (options: LaunchOptions) => Promise<Browser> = options => chromium.launch(options),
  ) {
    this.options = options;
    this.launch = launch;
  }

  ensurePage(): Promise<Page> {
    return this.withLock(async () => {
      this.assertOpen();
      if (this.maintenancePage && !this.maintenancePage.isClosed()) return this.maintenancePage;
      await this.ensureBrowser();
      const page = await this.requiredContext().newPage();
      if (this.closing) {
        await page.close().catch(() => {});
        throw new Error("Browser session is closing");
      }
      this.maintenancePage = page;
      return page;
    });
  }

  acquirePage(key: string, maxPages: number): Promise<BrowserPageLease> {
    if (!Number.isInteger(maxPages) || maxPages < 1) {
      return Promise.reject(new Error("Browser page capacity must be a positive integer"));
    }
    return this.withLock(async () => {
      this.assertOpen();
      let managed = this.pages.get(key);
      if (managed?.page.isClosed()) {
        this.pages.delete(key);
        managed = undefined;
      }
      if (!managed) {
        if (this.pages.size >= maxPages) {
          const inactive = [...this.pages.entries()].find(([, candidate]) => candidate.leases === 0);
          if (!inactive) throw new Error(`Browser page capacity ${maxPages} is fully leased`);
          const [oldestKey, oldest] = inactive;
          this.pages.delete(oldestKey);
          await oldest.page.close().catch(() => {});
        }
        await this.ensureBrowser();
        const page = await this.requiredContext().newPage();
        if (this.closing) {
          await page.close().catch(() => {});
          throw new Error("Browser session is closing");
        }
        managed = { page, leases: 0 };
        this.pages.set(key, managed);
      }
      managed.leases += 1;
      this.touch(key, managed);
      return this.lease(key, managed);
    });
  }

  closePage(key: string): Promise<void> {
    return this.withLock(async () => {
      const managed = this.pages.get(key);
      if (!managed) return;
      this.pages.delete(key);
      await managed.page.close().catch(() => {});
    });
  }

  storageState(): Promise<Awaited<ReturnType<BrowserContext["storageState"]>>> {
    return this.withLock(async () => {
      this.assertOpen();
      await this.ensureBrowser();
      return this.requiredContext().storageState();
    });
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = this.withLock(async () => {
      await this.launchTask?.catch(() => {});
      const browser = this.browser;
      this.browser = undefined;
      this.context = undefined;
      this.maintenancePage = undefined;
      this.pages.clear();
      if (browser) await browser.close();
    });
    return this.closePromise;
  }

  private lease(key: string, managed: ManagedPage): BrowserPageLease {
    let released = false;
    return {
      page: managed.page,
      release: async (options = {}) => {
        if (released) return;
        released = true;
        await this.withLock(async () => {
          const current = this.pages.get(key);
          if (current !== managed) return;
          current.leases = Math.max(0, current.leases - 1);
          if (options.discard || current.page.isClosed()) {
            this.pages.delete(key);
            if (!current.page.isClosed()) await current.page.close().catch(() => {});
            return;
          }
          this.touch(key, current);
        });
      },
    };
  }

  private touch(key: string, managed: ManagedPage): void {
    this.pages.delete(key);
    this.pages.set(key, managed);
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser?.isConnected() && this.context) return;
    this.assertOpen();
    const launch = this.openBrowser();
    this.launchTask = launch;
    try {
      await launch;
    } finally {
      if (this.launchTask === launch) this.launchTask = undefined;
    }
  }

  private async openBrowser(): Promise<void> {
    this.options.assertReady();
    const browser = await this.launch({
      executablePath: this.options.executablePath,
      headless: this.options.headless,
      args: this.options.args,
    });
    try {
      if (this.closing) throw new Error("Browser session is closing");
      const context = await browser.newContext({
        storageState: this.options.storageStatePath,
        viewport: this.options.viewport,
      });
      if (this.closing) throw new Error("Browser session is closing");
      this.browser = browser;
      this.context = context;
      browser.on("disconnected", () => {
        if (this.browser !== browser) return;
        this.browser = undefined;
        this.context = undefined;
        this.maintenancePage = undefined;
        this.pages.clear();
      });
    } catch (error) {
      await browser.close().catch(() => {});
      throw error;
    }
  }

  private requiredContext(): BrowserContext {
    if (!this.context) throw new Error("Browser context is unavailable");
    return this.context;
  }

  private assertOpen(): void {
    if (this.closing) throw new Error("Browser session is closing");
  }

  private async withLock<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let unlock!: () => void;
    this.operationTail = new Promise<void>(resolve => {
      unlock = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      unlock();
    }
  }
}
