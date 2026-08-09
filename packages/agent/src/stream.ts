import type { stream } from "@tsuuanmi/pi-ai";

/** Function used to produce a provider response stream for an agent turn. */
export type StreamFunction = (
	...args: Parameters<typeof stream>
) => ReturnType<typeof stream> | Promise<ReturnType<typeof stream>>;
