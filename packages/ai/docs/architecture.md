# Architecture

`@tsuuanmi/pi-ai` owns provider-neutral model protocol and provider implementations. It does not own Pi config files, `auth.json`, agent loops, tool execution, sessions, or TUI behavior.

## Dependency Boundary

```text
packages/pi
  ├─ reads auth.json and settings
  ├─ selects models and passes credentials
  └─ uses packages/ai

packages/agent
  ├─ runs agent loops and tools
  └─ uses packages/ai protocol types

packages/ai
  └─ depends on neither pi nor agent
```

## Runtime Flow

```text
Model + Context + StreamOptions
        |
        v
src/stream.ts
        |
        v
provider/provider-registry.ts
        |
        v
provider/built-ins.ts
        |
        v
provider/anthropic/index.ts
provider/openai/completions/index.ts
provider/openai/responses/index.ts
provider/openai/codex/responses.ts
        |
        v
transport/event-stream.ts
        |
        v
AssistantMessageEventStream
```

## Source Layout

```text
src/
  adapter/      model-bound Adapter wrapper
  auth/         OAuth flows only
  model/        Model metadata, catalog, config, request and response helpers
  parsing/      general JSON parsing and repair
  protocol/     provider-neutral Context, Message, Content, Tool, Usage, options
  provider/     provider registry, built-ins, Anthropic and OpenAI implementations
  schema/       schema validation helpers
  transport/    low-level event stream and proxy helpers
  stream.ts     high-level stream/complete dispatch
  index.ts      grouped public barrel
```

## Directory Ownership

### `model/`

Owns model metadata and model-call helpers:

- `index.ts`: `Model`, provider compatibility metadata, stream function shape.
- `catalog.ts`: model lookup, supported reasoning levels, cost calculation.
- `config.ts`: reusable model config schemas and override merge helpers.
- `request.ts`: model request option exports.
- `response.ts`: model response exports and context-overflow detection.
- `generated.ts`: generated model catalog data.

### `protocol/`

Owns provider-neutral data shapes:

- `Context`
- `Message`
- `Content`
- `Tool`
- `Usage`
- `StreamOptions`
- diagnostics and ids

### `provider/`

Owns provider registration and implementation:

- `provider-registry.ts`: runtime provider registry.
- `built-ins.ts`: built-in provider registration and on-demand module loading.
- `config.ts`: provider config helpers such as env lookup and header merging.
- `anthropic/`: Anthropic Messages provider.
- `openai/`: OpenAI Completions, Responses, and Codex providers.

### `auth/`

Owns OAuth flows and OAuth provider registration only. API key storage and lookup are owned by Pi.

### `transport/`

Owns low-level transport primitives. High-level dispatch remains in `stream.ts` because it selects providers and calls their stream functions.

## Import Rules

Allowed:

```text
pi -> ai
agent -> ai
ai internal modules -> ai internal modules
```

Not allowed:

```text
ai -> pi
ai -> agent
agent -> pi
```

## Explicit Non-Goals

`@tsuuanmi/pi-ai` should not contain:

- `auth.json` storage or account selection
- environment API-key discovery
- agent loops or tool execution
- filesystem/bash/LSP tools
- TUI rendering
- workflow planning
- Pi extension runtime
