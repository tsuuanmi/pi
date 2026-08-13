# tools/settings

Mirrors `src/tools/settings.ts`.

Registers `internet_settings` — inspects or updates ChatGPT Web package settings. Optional
`autoLogin` boolean parameter. When omitted it reads the settings (`get()`); when provided it
persists the value (`setAutoLogin`). Returns the resulting settings as text and as `details`.
