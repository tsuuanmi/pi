import { createToolRegistry, defineTool } from "@tsuuanmi/pi-agent";
import { describe, expect, test } from "vitest";
import { repeatTool } from "#agent-test/fixtures";

describe("tool registry", () => {
	test("defines tools with required declaration fields", () => {
		const tool = repeatTool("defined");

		expect(defineTool(tool)).toBe(tool);
		expect(createToolRegistry([defineTool(tool)]).has("defined")).toBe(true);
		expect(() => defineTool({ ...repeatTool(), name: " " })).toThrow("Tool name is required");
		expect(() => defineTool({ ...repeatTool(), description: "" })).toThrow("Tool description is required");
		expect(() => defineTool({ ...repeatTool(), label: "\t" })).toThrow("Tool label is required");
	});

	test("rejects duplicate tool registration", () => {
		const registry = createToolRegistry([repeatTool()]);

		expect(() => registry.register(repeatTool())).toThrow('Tool "repeat" is already registered');

		registry.replace(repeatTool());
		expect(registry.list()).toHaveLength(1);
	});
});
