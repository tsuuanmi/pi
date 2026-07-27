export type UsageProvenance =
	| { type: "provider_reported"; fields: string[] }
	| { type: "provider_unavailable"; reason: string }
	| { type: "fallback_default"; reason: string };

export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	/** Subset of `cacheWrite` written with 1h retention. Only Anthropic reports this split. */
	cacheWrite1h?: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
}
