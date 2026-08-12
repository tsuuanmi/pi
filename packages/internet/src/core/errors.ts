export type InternetErrorCode = "config_missing" | "config_invalid" | "daemon_unavailable" | "daemon_rejected";

export interface InternetErrorOptions {
	code: InternetErrorCode;
	status?: number;
	retryable?: boolean;
	cause?: unknown;
}

export class InternetError extends Error {
	readonly code: InternetErrorCode;
	readonly status?: number;
	readonly retryable: boolean;

	constructor(message: string, options: InternetErrorOptions) {
		super(message, { cause: options.cause });
		this.name = "InternetError";
		this.code = options.code;
		this.status = options.status;
		this.retryable = options.retryable ?? false;
	}
}

export function isInternetError(error: unknown): error is InternetError {
	return error instanceof InternetError;
}
