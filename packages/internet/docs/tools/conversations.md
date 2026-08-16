# tools/conversations

Mirrors `src/tools/conversations.ts`.

`internet_conversation` inspects or resets the account-scoped durable ChatGPT conversation authority.
It supports these actions:

- `status` reports the account and whether the durable authority canary has passed.
- `canary` verifies the authenticated ChatGPT conversation path. It requires `confirm: true`.
- `reset` stops the account daemon and removes its private conversation state. It requires
  `confirm: true`.

The tool never exposes conversation contents or credentials. A reset intentionally removes the
journal and authority state; the next ChatGPT request creates a new durable conversation binding.
