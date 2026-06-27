# Resources

Resource loading and diagnostic reporting for extensions, skills, and prompts.

## Overview

The resources module provides a unified system for discovering, loading, and validating resources from multiple source locations (bundled, user, project, package).

## Resource Sources

| Source | Location | Priority |
|--------|----------|----------|
| Bundled | Built into pi | Lowest |
| User | `~/.pi/agent/` | Medium |
| Project | `.pi/` | High |
| Package | npm package | Medium |
| Temporary | Runtime | Highest |

## Diagnostics

Resource loading produces `ResourceDiagnostic` objects for any issues found:

```typescript
interface ResourceDiagnostic {
  code: string;
  message: string;
  path?: string;
  source?: string;
}
```

## See Also

- [Extensions](../extensions/extensions.md) - Extension resource loading