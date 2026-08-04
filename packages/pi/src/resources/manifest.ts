import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RESOURCE_TYPES } from "#pi/resources/constants";
import type { PiManifest } from "#pi/resources/types";

export function readManifest(root: string): PiManifest | undefined {
	const path = join(root, "package.json");
	if (!existsSync(path)) return undefined;

	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(`Invalid package manifest: ${path}`, { cause: error });
	}

	if (!value || typeof value !== "object" || !("pi" in value) || value.pi === undefined) return undefined;
	if (!value.pi || typeof value.pi !== "object" || Array.isArray(value.pi)) {
		throw new Error(`Invalid pi manifest in ${path}`);
	}

	for (const type of RESOURCE_TYPES) {
		const entries = (value.pi as Record<string, unknown>)[type];
		if (entries !== undefined && (!Array.isArray(entries) || !entries.every((entry) => typeof entry === "string"))) {
			throw new Error(`Invalid pi.${type} manifest entry in ${path}`);
		}
	}

	return value.pi as PiManifest;
}
