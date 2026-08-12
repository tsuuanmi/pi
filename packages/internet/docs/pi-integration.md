# Internet — Pi Integration

## Extension contract

Pi loads the package's default export from `dist/extension.js`. The async factory uses only the
public `@tsuuanmi/pi/extensions` contract:

```ts
export default async function internetExtension(pi: ExtensionAPI): Promise<void> {
  registerOpenAiProviders(pi, await new AccountRegistry().list());
  registerInternetTools(internetToolHost(pi));
  registerInternetHooks(pi);
  pi.registerHudProvider(readDaemonStatus);
}
```

`internetToolHost` follows the workflows package pattern: it maps Pi's rich `ExtensionContext` to a
small `InternetContext`, keeping tool modules independent of the host runtime.

## Provider registration

The package calls `registerProvider` with the current `ProviderConfig` shape:

```ts
{
  name: "ChatGPT Web",
  api: "openai-responses",
  baseUrl: "http://127.0.0.1:17841/v1",
  apiKey: "local-loopback",
  authHeader: false,
  models: CHATGPT_WEB_MODELS,
}
```

The non-secret placeholder satisfies Pi's OpenAI client requirement. The OpenAI SDK may send it as
its ordinary authorization header; the loopback daemon does not authenticate inference routes.
`authHeader: false` prevents Pi from adding a second provider-level header. The real admin control
credential is handled separately by the daemon client.

The canonical model ids are daemon route slugs: `chatgpt-web/high` and `chatgpt-web/luna`. Pi passes
these through to `/v1/responses` unchanged.

## Tools

Tools are `ContextToolSpec` values with:

- `parameters` (TypeBox schema), not the deprecated `params` spelling;
- the five-argument execute signature `(id, params, signal, onUpdate, context)`;
- standard `{ content, details }` results.

Registered tools are `internet_status`, `internet_compact`, `internet_control`,
`internet_accounts`, `internet_account_add`, and `internet_account_set_enabled`.

## Hooks and HUD

`registerInternetHooks` installs `tool_call` and `turn_end` handlers. The HUD provider returns a
standard status-line entry with `turns` and `state` chips. It returns `undefined` if the daemon is
unavailable, so status rendering never breaks Pi startup.

## Discovery

The package manifest declares:

```json
{
  "pi": { "extensions": ["dist/extension.js"] }
}
```

Pi loads from `dist`, so rebuild after every source change. The package can also be added explicitly
through Pi's package/extension settings.

## Boundary rules

- Import only public `@tsuuanmi/pi*` entry points.
- Keep dependency direction `internet -> Pi`.
- Keep tests aligned with retained source responsibilities.
- Do not add a second Responses transport, browser owner, or replay cache.
