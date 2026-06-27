# Telemetry

Usage tracking and telemetry for Pi.

## Overview

Pi collects anonymous usage telemetry to improve the product. Telemetry is disabled by default and can be enabled via settings.

## Data Collected

- Model usage (provider, model ID, token counts)
- Feature usage (which tools and commands are used)
- Performance metrics (response times, error rates)

No source code, file contents, or personal data is collected.

## Configuration

```json
{
  "telemetry": {
    "enabled": true
  }
}
```

## See Also

- [API Usage Logging](../api-usage/api-usage-logging.md) - Local usage logs