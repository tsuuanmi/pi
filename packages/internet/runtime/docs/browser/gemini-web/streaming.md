# browser/gemini-web/streaming

Mirrors `src/browser/gemini-web/streaming.ts`.

Uses the rendered `model-response` DOM as the sole response source. It buffers in-progress DOM text, tolerates Gemini rewrites while the stop control is present, and emits the final text once after stop-control disappearance and two seconds of stability.
