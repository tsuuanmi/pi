import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium, type BrowserContext, type BrowserContextOptions, type Page } from "playwright-core";
import type { AppConfig } from "./config";
import { atomicWriteFile } from "./config";
import {
  isAuthenticatedChatGptHome,
  CHATGPT_HOME_URL,
  detectChatGptAccountCapabilities,
} from "./session";
import type { ChatGptWebAccountCapabilities } from "./models";
import { readChatGptStorageState } from "./login-state";

export interface BrowserLoginResult {
  storageStatePath: string;
  accountSurfaceUrl: string;
  solAvailable: boolean;
  proAvailable: boolean;
}

interface LoginVerificationMarker {
  version: 1;
  authenticated: true;
  verifiedAt: string;
  solAvailable?: boolean;
  proAvailable?: boolean;
}

export function loginVerificationMarkerPath(storageStatePath: string): string {
  return `${storageStatePath}.verified.json`;
}

function writeVerificationMarker(
  storageStatePath: string,
  capabilities: ChatGptWebAccountCapabilities,
): void {
  const marker: LoginVerificationMarker = {
    version: 1,
    authenticated: true,
    verifiedAt: new Date().toISOString(),
    ...capabilities,
  };
  atomicWriteFile(loginVerificationMarkerPath(storageStatePath), `${JSON.stringify(marker)}\n`);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForAuthenticatedChatGptHome(
  context: BrowserContext,
  timeoutMs: number,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      if (!page.isClosed() && await isAuthenticatedChatGptHome(page)) return page;
    }
    await delay(Math.min(250, Math.max(1, deadline - Date.now())));
  }
  throw new Error("Timed out waiting for an authenticated ChatGPT page");
}

async function inspectStoredState(
  config: AppConfig,
  storageState: NonNullable<BrowserContextOptions["storageState"]>,
): Promise<ChatGptWebAccountCapabilities & { url: string }> {
  const verifierBrowser = await chromium.launch({
    executablePath: config.chromeExecutablePath,
    headless: false,
    ignoreDefaultArgs: ["--password-store=basic", "--use-mock-keychain"],
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  try {
    const verifierContext = await verifierBrowser.newContext({ storageState });
    try {
      const verifierPage = await verifierContext.newPage();
      await verifierPage.goto(CHATGPT_HOME_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const authenticatedPage = await waitForAuthenticatedChatGptHome(verifierContext, 60_000);
      return { ...await detectChatGptAccountCapabilities(authenticatedPage), url: authenticatedPage.url() };
    } finally {
      await verifierContext.close();
    }
  } finally {
    await verifierBrowser.close();
  }
}

export async function inspectBrowserLoginCapabilities(config: AppConfig): Promise<ChatGptWebAccountCapabilities> {
  if (!browserLoginStateExists(config)) throw new Error("ChatGPT login state is missing or unverified");
  const inspected = await inspectStoredState(config, config.storageStatePath);
  writeVerificationMarker(config.storageStatePath, inspected);
  return { solAvailable: inspected.solAvailable, proAvailable: inspected.proAvailable };
}

export function storedBrowserLoginCapabilities(
  config: AppConfig,
): Partial<ChatGptWebAccountCapabilities> {
  if (!browserLoginStateExists(config)) return {};
  try {
    const marker = JSON.parse(readFileSync(loginVerificationMarkerPath(config.storageStatePath), "utf8")) as Partial<LoginVerificationMarker>;
    return {
      ...(typeof marker.solAvailable === "boolean" ? { solAvailable: marker.solAvailable } : {}),
      ...(typeof marker.proAvailable === "boolean" ? { proAvailable: marker.proAvailable } : {}),
    };
  } catch {
    return {};
  }
}

export async function importChatGptLogin(
  config: AppConfig,
  sourcePath: string,
): Promise<BrowserLoginResult> {
  if (!existsSync(config.chromeExecutablePath)) {
    throw new Error(`Google Chrome was not found at ${config.chromeExecutablePath}. Pass --chrome with its executable path.`);
  }
  const state = readChatGptStorageState(sourcePath);
  const inspected = await inspectStoredState(config, state);
  atomicWriteFile(config.storageStatePath, `${JSON.stringify(state)}\n`);
  writeVerificationMarker(config.storageStatePath, inspected);
  return {
    storageStatePath: config.storageStatePath,
    accountSurfaceUrl: inspected.url,
    solAvailable: inspected.solAvailable,
    proAvailable: inspected.proAvailable,
  };
}

export async function loginToChatGpt(
  config: AppConfig,
  options: { timeoutMs?: number } = {},
): Promise<BrowserLoginResult> {
  if (!existsSync(config.chromeExecutablePath)) {
    throw new Error(`Google Chrome was not found at ${config.chromeExecutablePath}. Pass --chrome with its executable path.`);
  }
  const profileDir = join(dirname(config.storageStatePath), "login-profile");
  mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  process.stdout.write(
    "A normal Chrome window is open. Sign in to ChatGPT, confirm that the composer is visible, then quit this dedicated Chrome instance completely.\n",
  );
  const loginBrowser = spawn(config.chromeExecutablePath, [
    `--user-data-dir=${profileDir}`,
    "--new-window",
    "--disable-background-mode",
    "--no-first-run",
    "--no-default-browser-check",
    CHATGPT_HOME_URL,
  ], { env: process.env, stdio: "ignore" });
  const loginExit = await new Promise<number>((resolveExit, rejectExit) => {
    loginBrowser.once("error", rejectExit);
    loginBrowser.once("exit", (code, signal) => {
      if (signal) rejectExit(new Error(`Normal Chrome login window exited from signal ${signal}`));
      else resolveExit(code ?? 1);
    });
  });
  if (loginExit !== 0) throw new Error(`Normal Chrome login window exited with status ${loginExit}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: config.chromeExecutablePath,
    headless: false,
    ignoreDefaultArgs: ["--password-store=basic", "--use-mock-keychain"],
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  try {
    const initialPage = context.pages()[0] ?? await context.newPage();
    await initialPage.goto(CHATGPT_HOME_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const page = await waitForAuthenticatedChatGptHome(context, options.timeoutMs ?? 60_000);
    const state = await context.storageState();

    const inspected = await inspectStoredState(config, state);
    atomicWriteFile(config.storageStatePath, `${JSON.stringify(state)}\n`);
    writeVerificationMarker(config.storageStatePath, inspected);
    return {
      storageStatePath: config.storageStatePath,
      accountSurfaceUrl: page.url(),
      solAvailable: inspected.solAvailable,
      proAvailable: inspected.proAvailable,
    };
  } finally {
    await context.close();
    if (browserLoginStateExists(config)) rmSync(profileDir, { recursive: true, force: true });
  }
}

export function browserLoginStateExists(config: AppConfig): boolean {
  if (!existsSync(config.storageStatePath)) return false;
  const markerPath = loginVerificationMarkerPath(config.storageStatePath);
  if (!existsSync(markerPath)) return false;
  try {
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as Partial<LoginVerificationMarker>;
    return marker.version === 1 && marker.authenticated === true && typeof marker.verifiedAt === "string";
  } catch {
    return false;
  }
}

export async function checkBrowserEngine(config: AppConfig): Promise<void> {
  if (!existsSync(config.chromeExecutablePath)) throw new Error(`Google Chrome was not found at ${config.chromeExecutablePath}`);
  const browser = await chromium.launch({
    executablePath: config.chromeExecutablePath,
    headless: true,
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    if (await page.evaluate(() => document.readyState) !== "complete") throw new Error("Browser page did not reach complete state");
  } finally {
    await browser.close();
  }
}
