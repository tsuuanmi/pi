import type { RuntimeEvent } from "#agent/events";
import type { RunRequest } from "#agent/run";

/**
 * Runtime execution backend for an Agent.
 *
 * Implementations own how agent turns are produced. The default backend uses
 * the standard agent protocol/runtime loop, while Node-only packages can provide
 * process or protocol-backed implementations through `@tsuuanmi/pi-agent/node`.
 */
export interface AgentBackend {
	/** Stream runtime events and finish with one done or error event. */
	stream(request: RunRequest): AsyncIterable<RuntimeEvent>;
	dispose?(): Promise<void> | void;
}

/** Standard LLM/tool-loop runtime interface. */
export interface AgentRuntime extends AgentBackend {}
