# tools/register

Mirrors `src/tools/register.ts`.

The tool registration aggregator.

```ts
registerInternetTools(
  host: Pick<ExtensionAPI, "registerTool">,
  manager: OwnedDaemonManager,
  settings: InternetSettingsService,
): void
```

Calls the per-area registration functions in order:

1. `registerAccountsTools(host)` — account tools.
2. `registerStatusTools(host)` — status tool.
3. `registerDoctorTool(host)` — diagnostics tool.
4. `registerControlTools(host)` — admin control tool.
5. `registerCompactTools(host)` — compaction tool.
6. `registerDaemonTool(host, manager)` — daemon lifecycle tool.
7. `registerHarnessTool(host, manager)` — harness tool.
8. `registerSettingsTool(host, settings)` — settings tool.
9. `registerWebTools(host)` — web search/fetch tools.

Tools use TypeBox `parameters` and Pi's `registerTool` contract directly. The `manager` and
`settings` dependencies are only passed to the tools that need them.
