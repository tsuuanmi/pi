# Resource loader

The `src/loader/` layer resolves Pi's package identity and discovers resources before they are exposed to the runtime. It is the boundary between filesystem/package layout and runtime services.

## Responsibilities

- Resolve the installed package directory and package metadata.
- Derive the agent, session, authentication, binary, and documentation paths.
- Read package configuration and expand configured values.
- Discover project, user, built-in, and package resources.
- Load extensions, skills, prompt templates, themes, and model registrations.
- Return diagnostics for missing, invalid, or partially loadable resources.
- Resolve context files and prompt files from project ancestors and user directories.

The [Resources](../resources/index.md) reference documents the resource records and diagnostics returned by this layer.

## Resource categories

The loader handles these runtime-facing categories:

| Category | Loader boundary | Documentation |
| --- | --- | --- |
| Extensions | `loader/extensions/` | [Extensions](../extensions/index.md) |
| Skills | `loader/skill.ts` | [Skills](skills/index.md) |
| Prompt templates | `loader/prompt-templates.ts` | [Prompt templates](prompt-templates.md) |
| Themes | `loader/themes.ts` | [Themes](../ui/theme/index.md) |
| Models | `loader/model-registry.ts` | [Models](../runtime/models/models.md) |
| Context and prompts | `loader/context.ts` | [Using Pi](../app/usage.md#context-files) |
| Packages | `loader/package.ts` and `loader/discovery.ts` | [Pi packages](../package-manager/packages.md) |

## Resolution rules

Paths may be absolute, relative to the current working directory, or use `~`. Package assets are resolved through the loader's package-path helpers; application code should not use `__dirname` directly for bundled assets. `PI_PACKAGE_DIR` can override the package directory for relocatable or store-based installations.

Resource loading is diagnostic rather than all-or-nothing: a bad optional resource is reported with its source path while other resources continue to load when possible.
