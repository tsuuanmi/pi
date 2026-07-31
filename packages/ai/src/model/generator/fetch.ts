export interface FetchOptions {
	timeoutMs?: number;
	retries?: number;
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
	const timeoutMs = options.timeoutMs ?? 15_000;
	const retries = options.retries ?? 2;
	let lastError: unknown;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				headers: {
					Accept: "application/json",
					"User-Agent": "pi-model-generator",
				},
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`Request failed: ${response.status} ${response.statusText}`);
			}

			return (await response.json()) as T;
		} catch (error) {
			lastError = error;
			if (attempt < retries) {
				await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
			}
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new Error(`Failed to fetch ${url}`, { cause: lastError });
}
