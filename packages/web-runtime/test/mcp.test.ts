import { describe, expect, test } from "vitest";
import { McpClientSession } from "../src/mcp/client.ts";
import { McpServerSession } from "../src/mcp/server.ts";
import type { WebTool } from "../src/types.ts";

const tools = (): readonly WebTool[] => [{ name: "read", inputSchema: { type: "object" } }];

async function sessions(call: (name: string, input: unknown) => Promise<unknown>) {
	let server: McpServerSession;
	const client = McpClientSession.create((message) => server.deliver(message));
	server = await McpServerSession.open(tools(), call, (message) => client.deliver(message));
	await client.open();
	return { client, server };
}

describe("private MCP sessions", () => {
	test("executes only a bound capability and honors revocation", async () => {
		const { client, server } = await sessions(async (name, input) => ({ name, input }));
		const capability = server.issue("turn-1", 10);
		server.bind_turn("turn-1", capability);
		client.bind_turn("turn-1", capability);

		expect(await client.list_tools(capability)).toHaveLength(1);
		await expect(client.call_tool(capability, "read", { path: "x" })).resolves.toEqual({
			name: "read",
			input: { path: "x" },
		});

		server.revoke(capability);
		await expect(client.list_tools(capability)).rejects.toThrow(/expired or revoked/);
		await client.close();
		await server.close();
	});

	test("rejects unbound, revoked, and unsupported requests", async () => {
		const { client, server } = await sessions(async () => undefined);
		const capability = server.issue("turn-1", 1_000);

		await expect(client.list_tools(capability)).rejects.toThrow(/not bound/);
		server.bind_turn("turn-1", capability);
		client.bind_turn("turn-1", capability);
		await expect(client.call_tool(capability, "write", {})).rejects.toThrow(/unsupported tool/);
		server.revokeTurn("turn-1");
		await expect(client.list_tools(capability)).rejects.toThrow(/not bound|revoked/);
		await client.close();
		await server.close();
	});
});
