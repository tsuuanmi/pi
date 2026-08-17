import {
  readVerifiedGeminiCapabilityMarker,
  type VerifiedGeminiCapabilityMarker,
} from "#runtime/browser/gemini-web/auth";
import type { GeminiWebRuntimeConfig } from "#runtime/core/config";
import type { RuntimeServerFactory } from "#runtime/core/provider";
import type { GeminiWebBrowserConfig } from "#runtime/browser/gemini-web/config";
import type { GeminiWebProviderConfig } from "#runtime/providers/gemini-web/config";
import { GEMINI_WEB_HOME_URL, GEMINI_WEB_MODEL_PREFIX } from "#runtime/providers/gemini-web/models";
import { startGeminiWebServer } from "#runtime/providers/gemini-web/server";

export function geminiWebBrowserConfig(config: GeminiWebRuntimeConfig): GeminiWebBrowserConfig {
  return {
    storageStatePath: config.storageStatePath,
    chromeExecutablePath: config.chromeExecutablePath,
    headed: config.headed,
    browserWindowWidth: config.browserWindowWidth,
    browserWindowHeight: config.browserWindowHeight,
    browserWindowPositionX: config.browserWindowPositionX,
    browserWindowPositionY: config.browserWindowPositionY,
    conversationStateDir: config.conversationStateDir,
    capabilityMarkerPath: config.capabilitiesPath,
  };
}

function geminiWebProviderConfig(
  config: GeminiWebRuntimeConfig,
  marker: VerifiedGeminiCapabilityMarker = readVerifiedGeminiCapabilityMarker(config.capabilitiesPath),
): GeminiWebProviderConfig {
  const models = marker.capabilities.available.map(id => `${GEMINI_WEB_MODEL_PREFIX}${id}`);
  if (models.length === 0) throw new Error("Gemini Web has no verified account models");
  return {
    adapter: "gemini-web",
    baseUrl: GEMINI_WEB_HOME_URL,
    defaultModel: models.includes(`${GEMINI_WEB_MODEL_PREFIX}flash`)
      ? `${GEMINI_WEB_MODEL_PREFIX}flash`
      : models[0]!,
    models,
    capabilityMarker: marker,
    geminiWeb: geminiWebBrowserConfig(config),
  };
}

export const geminiWebServerFactory: RuntimeServerFactory<GeminiWebRuntimeConfig> = {
  adapter: "gemini-web",
  serve(config, dependencies) {
    const provider = geminiWebProviderConfig(config);
    return startGeminiWebServer({
      ...provider,
      host: config.host,
      port: config.port,
      controlToken: config.controlToken,
      idleShutdownMs: config.idleShutdownMs,
    }, dependencies);
  },
};
