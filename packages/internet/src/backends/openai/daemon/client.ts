import {
	controlHeaders,
	type DaemonConfig,
	daemonBaseUrl,
	readDaemonConfig,
} from "#internet/backends/openai/daemon/auth";
import {
	type CompactRequest,
	type CompactResponse,
	DAEMON_ROUTES,
	type DaemonHealth,
} from "#internet/backends/openai/daemon/routes";
import { InternetError } from "#internet/core/errors";
import type { InternetAccount, InternetControlAction } from "#internet/core/types";

export interface DaemonClientOptions {
	config?: DaemonConfig;
	configDir?: string;
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
}

export class DaemonClient {
	readonly config: DaemonConfig;
	private readonly fetch: typeof globalThis.fetch;
	private readonly timeoutMs: number;

	private constructor(config: DaemonConfig, options: DaemonClientOptions) {
		this.config = config;
		this.fetch = options.fetch ?? globalThis.fetch;
		this.timeoutMs = options.timeoutMs ?? 5_000;
	}

	static async create(options: DaemonClientOptions = {}): Promise<DaemonClient> {
		const config = options.config ?? (await readDaemonConfig(options.configDir));
		return new DaemonClient(config, options);
	}

	static async forAccount(
		account: InternetAccount,
		options: Omit<DaemonClientOptions, "config" | "configDir"> = {},
	): Promise<DaemonClient> {
		const config = await readDaemonConfig(account.configDir);
		if (config.host !== account.host || config.port !== account.port) {
			throw new InternetError(`Account ${account.id} does not match its daemon config endpoint.`, {
				code: "config_invalid",
			});
		}
		return new DaemonClient(config, options);
	}

	baseUrl(includeVersion = false): string {
		return daemonBaseUrl(this.config, includeVersion);
	}

	health(signal?: AbortSignal): Promise<DaemonHealth> {
		return this.request<DaemonHealth>(DAEMON_ROUTES.health, { signal });
	}

	compact(input: CompactRequest, signal?: AbortSignal): Promise<CompactResponse> {
		return this.request<CompactResponse>(DAEMON_ROUTES.compact, {
			method: "POST",
			body: JSON.stringify(input),
			headers: { "content-type": "application/json" },
			signal,
		});
	}

	control(action: InternetControlAction, signal?: AbortSignal): Promise<unknown> {
		return this.request(DAEMON_ROUTES.control[action], {
			method: "POST",
			headers: controlHeaders(this.config.controlToken),
			signal,
		});
	}

	private async request<T>(path: string, init: RequestInit): Promise<T> {
		const timeout = AbortSignal.timeout(this.timeoutMs);
		const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
		let response: Response;
		try {
			response = await this.fetch(`${this.baseUrl()}${path}`, { ...init, signal });
		} catch (error) {
			throw new InternetError(`ChatGPT Web daemon is unavailable at ${this.baseUrl()}`, {
				code: "daemon_unavailable",
				retryable: true,
				cause: error,
			});
		}

		if (!response.ok) {
			const body = (await response.text()).trim();
			throw new InternetError(body || `Daemon request failed with HTTP ${response.status}`, {
				code: "daemon_rejected",
				status: response.status,
				retryable: response.status === 409 || response.status === 429 || response.status >= 500,
			});
		}
		if (response.status === 204) return undefined as T;
		return (await response.json()) as T;
	}
}
