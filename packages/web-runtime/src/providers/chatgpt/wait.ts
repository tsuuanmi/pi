export function throwIfAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new DOMException("ChatGPT web turn aborted", "AbortError");
}

export function wait(ms: number, signal: AbortSignal): Promise<void> {
	throwIfAborted(signal);
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = (): void => {
			clearTimeout(timer);
			reject(
				signal.reason instanceof Error ? signal.reason : new DOMException("ChatGPT web turn aborted", "AbortError"),
			);
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

export function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
	throwIfAborted(signal);
	return new Promise((resolve, reject) => {
		const onAbort = (): void => {
			reject(
				signal.reason instanceof Error ? signal.reason : new DOMException("ChatGPT web turn aborted", "AbortError"),
			);
		};
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error: unknown) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}
