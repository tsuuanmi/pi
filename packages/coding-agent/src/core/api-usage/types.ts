import type { AssistantMessage, Context, ProviderResponse, UsageProvenance } from "@tsuuanmi/pi-ai";

export interface RedactionMetadata {
	redacted_paths: string[];
	truncated_paths: string[];
}

export interface ApiUsageRecordV1 {
	schema_version: 1;
	started_at: string;
	completed_at: string;
	duration_ms: number;
	session_id: string;
	request_id: string;
	request_sequence: number;
	provider: string;
	model: string;
	api: string;
	transport?: string;
	response_model?: string;
	response_id?: string;
	status?: number;
	headers?: Record<string, string>;
	usage_provenance: UsageProvenance | { type: "provider_unavailable"; reason: "usage_provenance_missing" };
	usage_unavailable?: string;
	token_usage?: AssistantMessage["usage"];
	consumed_context: Context;
	request_context?: unknown;
	provider_payload?: unknown;
	response_summary?: unknown;
	redaction: RedactionMetadata;
}

export type ApiUsagePendingRequest = {
	requestId: string;
	requestSequence: number;
	startedAt: number;
	context: Context;
	provider: string;
	model: string;
	api: string;
	transport?: string;
	payload?: unknown;
	response?: ProviderResponse;
};
