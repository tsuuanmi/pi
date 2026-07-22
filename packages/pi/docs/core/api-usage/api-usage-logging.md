# API Usage Logging

Pi writes one sidecar JSONL record for each completed logical LLM provider invocation by default.

Path:

```text
<cwd>/.pi/{encodedSessionId}/api-usage.jsonl
```

The log is written by `AgentSession`, so it applies to interactive, print, JSON, RPC, and SDK sessions. Subagent sessions route their usage into the owning session bucket, so subagent runs do not mint separate top-level `.pi/subagent-*` directories. Records are sidecar files only; JSON and RPC stdout streams never include API usage records or logger diagnostics.

## Privacy

Records include the normalized LLM-visible context (`systemPrompt`, messages, tools, and tool-result content), provider/model/API metadata, safe response headers, response identifiers, provider payload snapshots, and token usage only when the provider reported it. Raw response bodies are not stored.

Before writing, Pi safely serializes the record, bounds large structures, and redacts known-sensitive headers, cookies, OAuth/API keys, signatures, auth-looking fields, and secret-looking text.

## Usage provenance

`usage_provenance.type` is `provider_reported` only when the provider returned usage data. Pi does not estimate exact token usage for this log. Missing or fallback usage is recorded with `usage_unavailable`.

## Disable

Add this to global or project settings:

```json
{
  "apiUsageLogging": {
    "enabled": false
  }
}
```
