import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "playwright-core";

import {
  validateGeminiCapabilityMarker,
  type GeminiWebCapabilityMarker,
} from "#runtime/browser/gemini-web/capabilities";
import { sanitizeGeminiStorageState } from "#runtime/browser/gemini-web/login-state";
import { atomicWriteFile } from "#runtime/core/config";
import {
  GEMINI_AUTHENTICATED_ANCHOR_URL,
  GEMINI_SIGN_IN_BUTTON_SELECTOR,
} from "#runtime/browser/gemini-web/session";

export interface GeminiAuthSnapshot {
  signOutHref?: string;
  signInVisible: boolean;
}

export type GeminiAuthEvidence =
  | { status: "signed-in"; signOutHref: typeof GEMINI_AUTHENTICATED_ANCHOR_URL; reason: "verified-sign-out-link" }
  | { status: "signed-out"; reason: "sign-in-button" }
  | { status: "unknown"; reason: "no-auth-evidence" };

export interface VerifiedGeminiCapabilityMarker {
  version: 1;
  provider: "gemini-web";
  authenticatedAt: string;
  signOutHref: typeof GEMINI_AUTHENTICATED_ANCHOR_URL;
  capabilities: GeminiWebCapabilityMarker;
}

function exactSignOutUrl(value: string | undefined): value is typeof GEMINI_AUTHENTICATED_ANCHOR_URL {
  if (!value) return false;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}` === GEMINI_AUTHENTICATED_ANCHOR_URL;
  } catch {
    return false;
  }
}

export function inspectGeminiAuthEvidence(snapshot: GeminiAuthSnapshot): GeminiAuthEvidence {
  if (snapshot.signInVisible) return { status: "signed-out", reason: "sign-in-button" };
  if (exactSignOutUrl(snapshot.signOutHref)) {
    return { status: "signed-in", signOutHref: snapshot.signOutHref, reason: "verified-sign-out-link" };
  }
  return { status: "unknown", reason: "no-auth-evidence" };
}

export async function readGeminiAuthSnapshot(page: Page): Promise<GeminiAuthSnapshot> {
  const anchor = page.locator("sidenav-mavatar-footer a").first();
  const signIn = page.locator(GEMINI_SIGN_IN_BUTTON_SELECTOR).first();
  const [signOutHref, signInVisible] = await Promise.all([
    anchor.getAttribute("href", { timeout: 2_000 }).catch(() => null),
    signIn.isVisible().catch(() => false),
  ]);
  return { signOutHref: signOutHref ?? undefined, signInVisible };
}

export async function assertGeminiPageAuthenticated(
  page: Page,
  timeoutMs = 10_000,
): Promise<Extract<GeminiAuthEvidence, { status: "signed-in" }>> {
  const deadline = Date.now() + timeoutMs;
  do {
    const evidence = inspectGeminiAuthEvidence(await readGeminiAuthSnapshot(page));
    if (evidence.status === "signed-in") return evidence;
    if (evidence.status === "signed-out") throw new Error("Gemini is signed out; browser login is required");
    await page.waitForTimeout(200);
  } while (Date.now() < deadline);
  throw new Error("Gemini login could not be verified from authenticated account evidence");
}

export function geminiLoginVerificationMarkerPath(storageStatePath: string): string {
  return `${resolve(storageStatePath)}.gemini-verified.json`;
}

export function validateVerifiedGeminiCapabilityMarker(value: unknown): VerifiedGeminiCapabilityMarker {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Gemini verification marker must be an object");
  const marker = value as Record<string, unknown>;
  if (marker.version !== 1 || marker.provider !== "gemini-web") throw new Error("Gemini verification marker is invalid");
  if (typeof marker.authenticatedAt !== "string" || !marker.authenticatedAt.trim()) throw new Error("Gemini verification marker is missing authenticatedAt");
  if (!exactSignOutUrl(typeof marker.signOutHref === "string" ? marker.signOutHref : undefined)) {
    throw new Error("Gemini verification marker has no verified account evidence");
  }
  return {
    version: 1,
    provider: "gemini-web",
    authenticatedAt: marker.authenticatedAt,
    signOutHref: marker.signOutHref as typeof GEMINI_AUTHENTICATED_ANCHOR_URL,
    capabilities: validateGeminiCapabilityMarker(marker.capabilities),
  };
}

export function readVerifiedGeminiCapabilityMarker(path: string): VerifiedGeminiCapabilityMarker {
  return validateVerifiedGeminiCapabilityMarker(JSON.parse(readFileSync(path, "utf8")));
}

export function writeVerifiedGeminiCapabilityMarker(
  path: string,
  evidence: Extract<GeminiAuthEvidence, { status: "signed-in" }>,
  capabilities: GeminiWebCapabilityMarker,
  authenticatedAt = new Date().toISOString(),
): void {
  if (!evidence.signOutHref || !exactSignOutUrl(evidence.signOutHref)) throw new Error("Gemini account evidence is not verified");
  const marker = validateVerifiedGeminiCapabilityMarker({
    version: 1,
    provider: "gemini-web",
    authenticatedAt,
    signOutHref: evidence.signOutHref,
    capabilities,
  });
  atomicWriteFile(path, `${JSON.stringify(marker, null, 2)}\n`);
}

export function browserLoginStateExists(
  storageStatePath: string,
  markerPath = geminiLoginVerificationMarkerPath(storageStatePath),
): boolean {
  if (!existsSync(storageStatePath) || !existsSync(markerPath)) return false;
  try {
    sanitizeGeminiStorageState(JSON.parse(readFileSync(storageStatePath, "utf8")));
    readVerifiedGeminiCapabilityMarker(markerPath);
    return true;
  } catch {
    return false;
  }
}
