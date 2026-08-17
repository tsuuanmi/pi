import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium, type LaunchOptions, type Page } from "playwright-core";

import { BrowserSession } from "#runtime/browser/session";
import {
  assertGeminiPageAuthenticated,
  browserLoginStateExists,
  geminiLoginVerificationMarkerPath,
  inspectGeminiAuthEvidence,
  readGeminiAuthSnapshot,
  readVerifiedGeminiCapabilityMarker,
  validateVerifiedGeminiCapabilityMarker,
  writeVerifiedGeminiCapabilityMarker,
  type GeminiAuthEvidence,
  type VerifiedGeminiCapabilityMarker,
} from "#runtime/browser/gemini-web/auth";
import {
  createGeminiCapabilityMarker,
  GEMINI_WEB_CAPABILITY_LABELS,
  GEMINI_WEB_MODEL_IDS,
} from "#runtime/browser/gemini-web/capabilities";
import { sanitizeGeminiStorageState } from "#runtime/browser/gemini-web/login-state";
import { detectGeminiModelLabels } from "#runtime/browser/gemini-web/session";
import { atomicWriteFile } from "#runtime/core/config";
import type { GeminiWebBrowserConfig } from "#runtime/browser/gemini-web/config";

function writePrivateJson(path: string, value: unknown): void {
  atomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sessionFor(config: GeminiWebBrowserConfig): BrowserSession {
  const launch = (options: LaunchOptions) => chromium.launch(options);
  return new BrowserSession(
    {
      executablePath: config.chromeExecutablePath,
      storageStatePath: config.storageStatePath,
      viewport: {
        width: config.browserWindowWidth ?? 700,
        height: config.browserWindowHeight ?? 500,
      },
      headless: config.headed !== true,
      args: [],
      assertReady: () => {},
    },
    launch,
  );
}

async function waitForSignIn(page: Page, timeoutMs: number): Promise<Extract<GeminiAuthEvidence, { status: "signed-in" }>> {
  const deadline = Date.now() + timeoutMs;
  let evidence = inspectGeminiAuthEvidence(await readGeminiAuthSnapshot(page));
  while (Date.now() < deadline) {
    if (evidence.status === "signed-in") return evidence;
    await new Promise(resolve => setTimeout(resolve, 250));
    evidence = inspectGeminiAuthEvidence(await readGeminiAuthSnapshot(page));
  }
  await assertGeminiPageAuthenticated(page);
  throw new Error("Gemini login verification timed out");
}

function discoveredCapabilities(labels: Partial<Record<(typeof GEMINI_WEB_MODEL_IDS)[number], string>>) {
  return GEMINI_WEB_MODEL_IDS.map(id => ({
    id,
    label: labels[id] ?? GEMINI_WEB_CAPABILITY_LABELS[id],
    available: labels[id] !== undefined,
    selected: false,
  }));
}

export async function importAndVerifyGeminiStorageState(
  sourcePath: string,
  config: GeminiWebBrowserConfig,
): Promise<VerifiedGeminiCapabilityMarker> {
  const sanitized = sanitizeGeminiStorageState(JSON.parse(readFileSync(sourcePath, "utf8")));
  const stagedStoragePath = `${config.storageStatePath}.import-${process.pid}`;
  const stagedMarkerPath = `${stagedStoragePath}.capabilities`;
  rmSync(stagedStoragePath, { force: true });
  rmSync(stagedMarkerPath, { force: true });
  try {
    writePrivateJson(stagedStoragePath, sanitized);
    const marker = await inspectGeminiLoginCapabilities({
      ...config,
      storageStatePath: stagedStoragePath,
      capabilityMarkerPath: stagedMarkerPath,
    });
    writePrivateJson(
      config.capabilityMarkerPath ?? geminiLoginVerificationMarkerPath(config.storageStatePath),
      marker,
    );
    writePrivateJson(config.storageStatePath, sanitized);
    return marker;
  } finally {
    rmSync(stagedStoragePath, { force: true });
    rmSync(stagedMarkerPath, { force: true });
  }
}

export async function probeGeminiLoginCapabilities(
  config: GeminiWebBrowserConfig,
): Promise<VerifiedGeminiCapabilityMarker> {
  const session = sessionFor(config);
  try {
    const page = await session.ensurePage();
    await page.goto("https://gemini.google.com/app", { waitUntil: "domcontentloaded" });
    const evidence = await waitForSignIn(page, 10_000);
    const labels = await detectGeminiModelLabels(page);
    return validateVerifiedGeminiCapabilityMarker({
      version: 1,
      provider: "gemini-web",
      authenticatedAt: new Date().toISOString(),
      signOutHref: evidence.signOutHref,
      capabilities: createGeminiCapabilityMarker(discoveredCapabilities(labels)),
    });
  } finally {
    await session.close();
  }
}

export async function inspectGeminiLoginCapabilities(
  config: GeminiWebBrowserConfig,
): Promise<VerifiedGeminiCapabilityMarker> {
  const marker = await probeGeminiLoginCapabilities(config);
  writePrivateJson(
    config.capabilityMarkerPath ?? geminiLoginVerificationMarkerPath(config.storageStatePath),
    marker,
  );
  return marker;
}

export async function loginToGemini(
  config: GeminiWebBrowserConfig,
  options: { timeoutMs?: number } = {},
): Promise<VerifiedGeminiCapabilityMarker> {
  if (!existsSync(config.chromeExecutablePath)) {
    throw new Error(`Google Chrome was not found at ${config.chromeExecutablePath}. Pass --chrome with its executable path.`);
  }
  const profileDir = join(dirname(config.storageStatePath), "login-profile");
  mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  process.stdout.write(
    "A normal Chrome window is open. Sign in to Gemini, then quit this dedicated Chrome instance completely.\n",
  );
  const loginBrowser = spawn(config.chromeExecutablePath, [
    `--user-data-dir=${profileDir}`,
    "--new-window",
    "--disable-background-mode",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-position=${config.browserWindowPositionX ?? 0},${config.browserWindowPositionY ?? 0}`,
    `--window-size=${config.browserWindowWidth ?? 700},${config.browserWindowHeight ?? 500}`,
    "https://gemini.google.com/app",
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
  const markerPath = config.capabilityMarkerPath ?? geminiLoginVerificationMarkerPath(config.storageStatePath);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto("https://gemini.google.com/app", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const evidence = await waitForSignIn(page, options.timeoutMs ?? 60_000);
    const storageState = sanitizeGeminiStorageState(await context.storageState());
    const labels = await detectGeminiModelLabels(page);
    const capabilities = createGeminiCapabilityMarker(discoveredCapabilities(labels));
    writePrivateJson(config.storageStatePath, storageState);
    writeVerifiedGeminiCapabilityMarker(markerPath, evidence, capabilities);
    return readVerifiedGeminiCapabilityMarker(markerPath);
  } finally {
    await context.close();
    if (browserLoginStateExists(config.storageStatePath, markerPath)) {
      rmSync(profileDir, { recursive: true, force: true });
    }
  }
}
