# Telemetry

Startup timing instrumentation for Pi.

## Overview

Pi provides built-in startup timing instrumentation that profiles initialization phases. This is distinct from analytics telemetry — the timing module only measures startup performance and outputs to stderr.

## Enabling Timing

Set the `PI_TIMING=1` environment variable to enable startup timing:

```bash
PI_TIMING=1 pi
```

When enabled, Pi prints a timing table to stderr at startup:

```
--- Startup Timings ---
  config: 45ms
  extensions: 120ms
  session: 30ms
  TOTAL: 195ms
------------------------
```

## API

```typescript
/** Reset all timing measurements */
function resetTimings(): void;

/** Record a timing checkpoint with a label */
function time(label: string): void;

/** Print all recorded timings to stderr */
function printTimings(): void;
```

Timing is a no-op when `PI_TIMING` is not set to `"1"`. The overhead of calling `time()` and `resetTimings()` is minimal (a single string comparison) when disabled.

## See Also

- [API Usage Logging](../api-usage/api-usage-logging.md) - Local usage logs with provider metrics