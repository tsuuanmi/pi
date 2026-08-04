import { join, resolve } from "node:path";
import { getPackageDir } from "#pi/config";

export { getPackageDir } from "#pi/config";

export function getReadmePath(): string {
	return resolve(join(getPackageDir(), "README.md"));
}

export function getDocsPath(): string {
	return resolve(join(getPackageDir(), "docs"));
}
