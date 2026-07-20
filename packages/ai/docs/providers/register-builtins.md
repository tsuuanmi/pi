# Register Built-in Providers

`register-builtins.ts` registers all built-in LLM providers on startup.

## Usage

Built-in providers are automatically registered when the package is imported. They are lazy-loaded — the API implementation is only constructed when first used.

## Built-in Providers

| Provider ID | API | Description |
|-------------|-----|-------------|
| `anthropic` | `anthropic-messages` | Claude models with extended thinking |
| `openai` | `openai-responses` | OpenAI Responses API (primary) |
| `openai` | `openai-completions` | OpenAI Chat Completions API |
| `openai-codex` | `openai-codex-responses` | OpenAI Codex Responses API |

## See Also

- [API Registry](api-registry.md) - How providers are registered and loaded
- [Anthropic Provider](anthropic.md) - Claude model details
- [OpenAI Providers](openai.md) - OpenAI API variants
