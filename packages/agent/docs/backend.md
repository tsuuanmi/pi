# Runtime Backend Metadata

`src/backend.ts` defines `RuntimeBackend`, `ProcessInfo`, and `ProtocolInfo`.

A backend identifies the execution kind and name and may include model, provider, process, protocol, and host-specific metadata. Runtime results expose this metadata without coupling the core package to a specific host process or protocol.
