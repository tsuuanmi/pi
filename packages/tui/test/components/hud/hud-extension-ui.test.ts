import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { refreshHudUi } from "#tui/components/hud/extension-ui";

describe("refreshHudUi", () => {
	it("calls setStatus to clear the __hud_refresh__ key", async () => {
		const calls: Array<{ key: string; text: string | undefined }> = [];
		await refreshHudUi({ ui: { setStatus: (key, text) => calls.push({ key, text }) } });
		assert.deepEqual(calls, [{ key: "__hud_refresh__", text: undefined }]);
	});

	it("is a no-op when ui or setStatus is absent", async () => {
		await refreshHudUi({});
		await refreshHudUi({ ui: {} });
	});
});
