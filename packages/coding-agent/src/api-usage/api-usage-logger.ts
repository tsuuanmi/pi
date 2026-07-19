import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
	ProviderRequestObserver,
	ProviderRequestObserverComplete,
	ProviderRequestObserverPayload,
	ProviderRequestObserverResponse,
	ProviderRequestObserverStart,
} from "@tsuuanmi/pi-agent";
import { redactValue, safeHeaders } from "#coding-agent/api-usage/redaction";
import { type SafeSerializeMetadata, safeSerialize, toJsonLine } from "#coding-agent/api-usage/safe-serialize";
import type { ApiUsagePendingRequest, ApiUsageRecordV1, RedactionMetadata } from "#coding-agent/api-usage/types";

export interface ApiUsageLoggerOptions {
	cwd: string;
	sessionId: string;
	path: string;
	transport?: string;
}

export class ApiUsageLogger implements ProviderRequestObserver {
	private readonly options: ApiUsageLoggerOptions;
	private readonly pending = new Map<string, ApiUsagePendingRequest>();
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(options: ApiUsageLoggerOptions) {
		this.options = options;
	}

	onRequestStart = (event: ProviderRequestObserverStart): void => {
		this.pending.set(event.requestId, {
			requestId: event.requestId,
			requestSequence: event.requestSequence,
			startedAt: event.startedAt,
			context: event.context,
			provider: event.model.provider,
			model: event.model.id,
			api: event.model.api,
			transport: this.options.transport,
		});
	};

	onRequestPayload = (event: ProviderRequestObserverPayload): void => {
		const request = this.pending.get(event.requestId);
		if (request) request.payload = event.payload;
	};

	onRequestResponse = (event: ProviderRequestObserverResponse): void => {
		const request = this.pending.get(event.requestId);
		if (request) request.response = event.response;
	};

	onRequestComplete = (event: ProviderRequestObserverComplete): void => {
		const request = this.pending.get(event.requestId) ?? this.createFallbackRequest(event);
		this.pending.delete(event.requestId);
		const record = this.buildRecord(request, event);
		this.enqueueWrite(record);
	};

	private createFallbackRequest(event: ProviderRequestObserverComplete): ApiUsagePendingRequest {
		return {
			requestId: event.requestId,
			requestSequence: event.requestSequence,
			startedAt: event.startedAt,
			context: event.context,
			provider: event.model.provider,
			model: event.model.id,
			api: event.model.api,
			transport: this.options.transport,
		};
	}

	private buildRecord(request: ApiUsagePendingRequest, event: ProviderRequestObserverComplete): ApiUsageRecordV1 {
		const redaction: RedactionMetadata = { redacted_paths: [], truncated_paths: [] };
		const serializeMetadata: SafeSerializeMetadata = { truncatedPaths: redaction.truncated_paths };
		const usageProvenance = event.message?.usageProvenance ?? {
			type: "provider_unavailable" as const,
			reason: "usage_provenance_missing" as const,
		};
		const providerReported = usageProvenance.type === "provider_reported";
		const record: ApiUsageRecordV1 = {
			schema_version: 1,
			started_at: new Date(request.startedAt).toISOString(),
			completed_at: new Date(event.completedAt).toISOString(),
			duration_ms: event.durationMs,
			session_id: this.options.sessionId,
			request_id: request.requestId,
			request_sequence: request.requestSequence,
			provider: request.provider,
			model: request.model,
			api: request.api,
			transport: request.transport,
			response_model: event.message?.responseModel,
			response_id: event.message?.responseId,
			status: request.response?.status,
			headers: safeHeaders(request.response?.headers, redaction),
			usage_provenance: usageProvenance,
			usage_unavailable: providerReported ? undefined : usageProvenance.reason,
			token_usage: providerReported ? event.message?.usage : undefined,
			consumed_context: request.context,
			request_context: { aborted: event.aborted, error: summarizeError(event.error) },
			provider_payload: request.payload,
			response_summary: summarizeMessage(event.message),
			redaction,
		};
		const serialized = safeSerialize(record, serializeMetadata);
		const redacted = redactValue(serialized, redaction) as ApiUsageRecordV1;
		redacted.redaction = redaction;
		return redacted;
	}

	private enqueueWrite(record: ApiUsageRecordV1): void {
		this.writeQueue = this.writeQueue
			.then(async () => {
				await mkdir(dirname(this.options.path), { recursive: true });
				await appendFile(this.options.path, toJsonLine(record), "utf8");
			})
			.catch(() => {
				// Sidecar logging is best-effort and must never fail an agent run or pollute stdout.
			});
	}
}

function summarizeMessage(message: ProviderRequestObserverComplete["message"]): unknown {
	if (!message) return undefined;
	return {
		stop_reason: message.stopReason,
		error_message: message.errorMessage,
		content_blocks: message.content.map((block) => ({ type: block.type })),
	};
}

function summarizeError(error: unknown): unknown {
	if (!error) return undefined;
	return error instanceof Error ? { name: error.name, message: error.message } : String(error);
}
