import type { PathMetadata, SourceOrigin, SourceScope } from "#pi/package-manager/types";

export type { SourceOrigin, SourceScope } from "#pi/package-manager/types";

export interface SourceInfo extends PathMetadata {
	path: string;
}

export function createSourceInfo(path: string, metadata: PathMetadata): SourceInfo {
	return { path, ...metadata };
}

export function createSyntheticSourceInfo(
	path: string,
	options: {
		source: string;
		scope?: SourceScope;
		origin?: SourceOrigin;
		baseDir?: string;
	},
): SourceInfo {
	return {
		path,
		source: options.source,
		scope: options.scope ?? "temporary",
		origin: options.origin ?? "top-level",
		baseDir: options.baseDir,
	};
}
