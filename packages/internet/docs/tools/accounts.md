# tools/accounts

Mirrors `src/tools/accounts.ts`.

Account tools expose the complete routing lifecycle:

- `internet_accounts` lists normalized browser and API accounts.
- `internet_account_add` requires `id` and `provider`. ChatGPT Web (`openai`) and Gemini Web
  (`gemini-web`) accept optional `configDir` and loopback `host`/`port`. `anthropic` and `google` require
  `apiKeyEnv` and reject browser settings.
- `internet_account_remove` removes routing metadata but deliberately leaves the private account
  directory intact.
- `internet_account_set_enabled` enables or disables an account.

Provider registration occurs at extension load, so add/remove/enable operations require a Pi reload.
API-key values are never accepted by these tools and never appear in their output.
