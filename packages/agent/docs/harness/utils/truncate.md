# Text Truncation

Text truncation utilities for managing long content in the agent harness.

See [Shell Output](shell-output.md) for the full truncation API including `truncateHead()`, `truncateTail()`, `truncateLine()`, `TruncationOptions`, and `TruncationResult`.

## Quick Reference

```typescript
import { truncateHead, truncateTail, DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES } from "@tsuuanmi/pi-agent";

// Keep the last 100 lines
const headResult = truncateHead(longText, { maxLines: 100 });

// Keep the first 50KB
const tailResult = truncateTail(longText, { maxBytes: 50 * 1024 });
```