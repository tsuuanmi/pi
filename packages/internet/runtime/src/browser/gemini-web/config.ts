export interface GeminiWebBrowserConfig {
  storageStatePath: string;
  chromeExecutablePath: string;
  headed?: boolean;
  browserWindowWidth?: number;
  browserWindowHeight?: number;
  browserWindowPositionX?: number;
  browserWindowPositionY?: number;
  turnTimeoutMs?: number;
  capabilityMarkerPath?: string;
  conversationStateDir: string;
}
