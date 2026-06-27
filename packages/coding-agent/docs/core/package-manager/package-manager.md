# Package Manager

Pi package management for sharing extensions, skills, prompts, and themes.

## Overview

Pi packages bundle distributable content (extensions, skills, prompts, themes) that can be installed from npm or git repositories.

## Package Format

A pi package is a standard npm package with a `pi` field in `package.json`:

```json
{
  "name": "@my-org/pi-my-tools",
  "pi": {
    "extensions": ["./src/extension.ts"],
    "skills": ["./skills/"],
    "prompts": ["./prompts/"],
    "themes": ["./themes/"]
  }
}
```

## See Also

- [Pi Packages](../../packages.md) - Full package management documentation
- [Extensions](../extensions/extensions.md) - Extension development