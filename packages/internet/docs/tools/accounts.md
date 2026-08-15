# tools/accounts

Mirrors `src/tools/accounts.ts`.

Account tools expose the complete routing lifecycle:

- `internet_accounts` lists normalized browser and API accounts.
- `internet_account_add` requires `id` and `provider`. ChatGPT Web (`openai`) accepts optional
  `configDir`, loopback `host`/`port`, and conversation mode. `anthropic` and `google` require
  `apiKeyEnv` and reject browser settings.
- `internet_account_remove` removes routing metadata but deliberately leaves the private account
  directory intact.
- `internet_account_set_enabled` enables or disables an account.
- `internet_account_conversation_mode` sets temporary or durable mode for ChatGPT Web accounts.

Provider registration occurs at extension load, so add/remove/enable operations require a Pi reload.
API-key values are never accepted by these tools and never appear in their output.
