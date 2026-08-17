# providers/gemini-web/provider

Mirrors `src/providers/gemini-web/provider.ts`.

Registers each enabled `gemini-web` account as an `openai-responses` provider backed by its private
loopback daemon. Model registration comes from the verified account capability marker.

The request adapter namespaces model IDs as `gemini-web/<mode>` and forwards only the Pi session and
turn identities in `metadata.pi_caller`. The runtime uses `session_id` as the immutable one-to-one
key for the native Gemini chat. ChatGPT environment metadata and file expansion are not reused.
