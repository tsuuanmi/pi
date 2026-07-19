import { valid, validRange } from "semver";

export function isExactNpmVersion(version: string | undefined): boolean {
	return valid(version ?? "") !== null;
}

export function getNpmVersionRange(version: string | undefined): string | undefined {
	return version ? (validRange(version) ?? undefined) : undefined;
}
