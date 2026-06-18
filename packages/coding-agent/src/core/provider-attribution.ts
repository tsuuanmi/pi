/**
 * Merge multiple header sources, with later sources overriding earlier ones.
 * Returns undefined when no headers are present.
 */
export function mergeHeaderSources(
	...headerSources: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
	const merged: Record<string, string> = {};
	for (const headers of headerSources) {
		if (headers) {
			Object.assign(merged, headers);
		}
	}
	return Object.keys(merged).length > 0 ? merged : undefined;
}
