# tools/register

Mirrors `src/tools/register.ts`.

`registerInternetTools(host, manager, settings, council)` is the tool composition boundary. It
registers account lifecycle, daemon status/doctor/control/compact/lifecycle, durable conversations,
bounded councils, Full harness, settings, and public web search/fetch.

Only tools that need a stateful service receive it: daemon tools receive `OwnedDaemonManager`,
settings receives `InternetSettingsService`, and `internet_council` receives `CouncilService`.
Backend provider registration remains outside this module in `backends/registry.ts`.
