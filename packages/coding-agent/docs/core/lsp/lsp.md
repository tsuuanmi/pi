# Language Server Protocol (LSP)

Integration with language servers for code intelligence features.

## Overview

Pi integrates with language servers to provide diagnostics, hover information, go-to-definition, and references. LSP is used by extensions and the coding agent to understand code structure.

## Supported Features

- **Diagnostics** — Real-time error and warning reporting
- **Hover** — Type information and documentation on hover
- **Definition** — Go to definition
- **References** — Find all references

## Configuration

LSP servers are configured per language. Pi auto-detects available servers from installed npm packages and system tools.

## See Also

- [Extensions](../extensions/extensions.md) - Extension API