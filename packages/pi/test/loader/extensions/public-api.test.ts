import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@tsuuanmi/pi/extensions";
import { createEventBus } from "@tsuuanmi/pi/extensions";
import { describe, expect, it } from "vitest";

describe("public extension API", () => {
	it("exposes extension contracts from the sole public entry point", () => {
		const bus = createEventBus();
		const unsubscribe = bus.on("extension", () => {});

		const _api: ExtensionAPI | undefined = undefined;
		const _context: ExtensionContext | undefined = undefined;
		const _event: SessionStartEvent | undefined = undefined;

		expect(bus).toBeDefined();
		expect(unsubscribe).toBeTypeOf("function");
		expect([_api, _context, _event]).toHaveLength(3);
	});

	it("does not publish deep extension subpaths", () => {
		const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
		const extensionPaths = Object.keys(packageJson.exports).filter((entry) => entry.startsWith("./extensions/"));

		expect(packageJson.exports["./extensions"]).toBeDefined();
		expect(extensionPaths).toEqual([]);
	});
});
