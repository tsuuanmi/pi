# extension

Mirrors `src/extension.ts`, the package composition root.

1. Read normalized accounts from `AccountRegistry`.
2. Narrow ChatGPT Web and Gemini Web accounts and construct `OwnedDaemonManager`.
3. Construct `InternetSettingsStore` and `CouncilService`.
4. Register all enabled providers through `registerInternetProviders`.
5. Register tools with explicit manager/settings/council dependencies.
6. Register hooks with browser accounts only.
7. Register daemon HUD status.
8. Auto-start authenticated browser daemons.

API accounts never enter the daemon manager or browser hooks. All composition uses public
`ExtensionAPI` methods.
