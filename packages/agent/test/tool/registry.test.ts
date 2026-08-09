import { Tool, ToolRegistry } from "@tsuuanmi/pi-agent";
import type { TSchema } from "typebox";
import { describe, expect, test } from "vitest";
import { repeatTool } from "#agent-test/fixtures";

describe("tool registry", () => {
	test("defines tools with required declaration fields", () => {
		const tool = repeatTool("defined");

		expect(tool).toBeInstanceOf(Tool);
		expect(new ToolRegistry([tool]).has("defined")).toBe(true);
		expect(() => Tool.define({ ...repeatTool(), name: " " })).toThrow("Tool name is required");
		expect(() => Tool.define({ ...repeatTool(), description: "" })).toThrow("Tool description is required");
		expect(() => Tool.define({ ...repeatTool(), label: "\t" })).toThrow("Tool label is required");
		expect(() => Tool.define({ ...repeatTool(), parameters: null as unknown as TSchema })).toThrow(
			"Tool parameters are required",
		);
		expect(() => Tool.define({ ...repeatTool(), execute: null as never })).toThrow(
			"Tool execute function is required",
		);
	});

	test("rejects duplicate tool registration", () => {
		const registry = new ToolRegistry([repeatTool()]);

		expect(() => registry.register(repeatTool())).toThrow('Tool "repeat" is already registered');

		registry.replace(repeatTool());
		expect(registry.list()).toHaveLength(1);
	});
});
