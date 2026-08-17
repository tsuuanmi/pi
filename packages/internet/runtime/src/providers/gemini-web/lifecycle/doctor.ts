import { existsSync, statSync } from "node:fs";

import {
  browserLoginStateExists,
  geminiLoginVerificationMarkerPath,
  readVerifiedGeminiCapabilityMarker,
} from "#runtime/browser/gemini-web/auth";
import { probeGeminiLoginCapabilities } from "#runtime/browser/gemini-web/login";
import { readGeminiStorageState } from "#runtime/browser/gemini-web/login-state";
import type { GeminiWebBrowserConfig } from "#runtime/browser/gemini-web/config";

export type GeminiDoctorStatus = "ok" | "warning" | "error";

export interface GeminiDoctorCheck {
  id: string;
  status: GeminiDoctorStatus;
  message: string;
}

export interface GeminiDoctorReport {
  ok: boolean;
  checks: GeminiDoctorCheck[];
}

function privateFile(path: string): boolean {
  if (process.platform === "win32") return true;
  return (statSync(path).mode & 0o077) === 0;
}

export async function runGeminiWebDoctor(config: GeminiWebBrowserConfig): Promise<GeminiDoctorReport> {
  const checks: GeminiDoctorCheck[] = [
    { id: "config", status: "ok", message: "Gemini Web browser configuration is valid" },
  ];

  if (!existsSync(config.storageStatePath)) {
    checks.push({ id: "storage", status: "error", message: "Gemini browser storage state is missing" });
  } else if (!privateFile(config.storageStatePath)) {
    checks.push({ id: "storage", status: "error", message: "Gemini browser storage state has unsafe permissions" });
  } else {
    try {
      readGeminiStorageState(config.storageStatePath);
      checks.push({ id: "storage", status: "ok", message: "Gemini browser storage state is sanitized" });
    } catch {
      checks.push({ id: "storage", status: "error", message: "Gemini browser storage state is invalid or unrelated" });
    }
  }

  if (browserLoginStateExists(config.storageStatePath)) {
    try {
      const marker = await probeGeminiLoginCapabilities(config);
      checks.push({
        id: "authenticated-surface",
        status: "ok",
        message: `Authenticated Gemini surface verified with ${marker.capabilities.available.length} model(s).`,
      });
    } catch (error) {
      checks.push({
        id: "authenticated-surface",
        status: "error",
        message: `Gemini authentication could not be verified: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const markerPath = config.capabilityMarkerPath
    ?? geminiLoginVerificationMarkerPath(config.storageStatePath);
  if (!existsSync(markerPath)) {
    checks.push({ id: "login", status: "error", message: "Gemini login verification marker is missing" });
  } else if (!privateFile(markerPath)) {
    checks.push({ id: "login", status: "error", message: "Gemini login verification marker has unsafe permissions" });
  } else {
    try {
      readVerifiedGeminiCapabilityMarker(markerPath);
      checks.push({ id: "login", status: "ok", message: "Gemini login has verified account evidence and capabilities" });
    } catch {
      checks.push({ id: "login", status: "error", message: "Gemini login verification marker is invalid" });
    }
  }

  if (!browserLoginStateExists(config.storageStatePath, markerPath)) {
    checks.push({ id: "auth-state", status: "error", message: "Gemini storage and verification marker are not a verified pair" });
  }
  checks.push({ id: "tools", status: "ok", message: "Gemini Web runs in browser-only text mode with no tools or tunnel" });
  return { ok: !checks.some(check => check.status === "error"), checks };
}

export function formatGeminiWebDoctorReport(report: GeminiDoctorReport): string {
  const icon: Record<GeminiDoctorStatus, string> = { ok: "ok", warning: "warning", error: "error" };
  return `${report.checks.map(check => `[${icon[check.status]}] ${check.message}`).join("\n")}\n`;
}
