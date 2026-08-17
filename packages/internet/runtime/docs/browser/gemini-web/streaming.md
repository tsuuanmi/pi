# browser/gemini-web/streaming

Mirrors `src/browser/gemini-web/streaming.ts`.

Uses the rendered `model-response` DOM as the sole response source. It emits stable completed lines, flushes final text after stop-control disappearance and two seconds of stability, and quarantines divergent already-emitted text.
