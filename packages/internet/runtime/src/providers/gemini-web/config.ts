import type { VerifiedGeminiCapabilityMarker } from "#runtime/browser/gemini-web/auth";
import type { GeminiWebBrowserConfig } from "#runtime/browser/gemini-web/config";
import { GEMINI_WEB_HOME_URL } from "#runtime/providers/gemini-web/models";

export interface GeminiWebProviderConfig {
  adapter: "gemini-web";
  baseUrl: typeof GEMINI_WEB_HOME_URL;
  defaultModel: string;
  models: readonly string[];
  capabilityMarker: VerifiedGeminiCapabilityMarker;
  geminiWeb: GeminiWebBrowserConfig;
}

export function validateGeminiWebProviderConfig(config: GeminiWebProviderConfig): void {
  if (config.adapter !== "gemini-web") throw new Error("Invalid Gemini Web adapter configuration");
  if (config.baseUrl !== GEMINI_WEB_HOME_URL) throw new Error("Gemini Web baseUrl must be https://gemini.google.com/app");
  if (!config.models.includes(config.defaultModel)) throw new Error("Gemini Web defaultModel must be listed in models");
  if (!config.geminiWeb.storageStatePath.trim() || !config.geminiWeb.chromeExecutablePath.trim()) {
    throw new Error("Gemini Web browser configuration requires storageStatePath and chromeExecutablePath");
  }
  if (!config.geminiWeb.conversationStateDir.trim()) throw new Error("Gemini Web requires conversationStateDir");
  if (config.capabilityMarker.provider !== "gemini-web") {
    throw new Error("Gemini Web capability marker belongs to another provider");
  }
}
