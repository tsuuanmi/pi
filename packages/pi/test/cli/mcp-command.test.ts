import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleMcpCommand } from "#pi/packages/mcp/commands/mcp";

// Capture stdout/stderr
async function captureOutput(
	fn: () => Promise<unknown>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	let stdout = "";
	let stderr = "";
	const origStdout = process.stdout.write.bind(process.stdout);
	const origStderr = process.stderr.write.bind(process.stderr);
	const origExitCode = process.exitCode;
	process.stdout.write = (chunk: string | Uint8Array) => {
		stdout += chunk.toString();
		return true;
	};
	process.stderr.write = (chunk: string | Uint8Array) => {
		stderr += chunk.toString();
		return true;
	};
	process.exitCode = undefined;
	try {
		await fn();
		const exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
		return { stdout, stderr, exitCode };
	} finally {
		process.stdout.write = origStdout;
		process.stderr.write = origStderr;
		process.exitCode = origExitCode;
	}
}

describe("mcp CLI command", () => {
	let origCwd: string;
	let cwd: string;

	beforeEach(async () => {
		origCwd = process.cwd();
		cwd = join(tmpdir(), `pi-mcp-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		process.chdir(cwd);
	});

	afterEach(async () => {
		process.chdir(origCwd);
		await rm(cwd, { recursive: true, force: true });
	});

	it("returns false for non-mcp commands", async () => {
		const handled = await handleMcpCommand(["workflow", "list"]);
		expect(handled).toBe(false);
	});

	it("shows usage with no verb", async () => {
		const { stdout, exitCode } = await captureOutput(() => handleMcpCommand(["mcp"]));
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Usage:");
		expect(stdout).toContain("pi mcp list");
	});

	it("shows usage with --help", async () => {
		const { stdout } = await captureOutput(() => handleMcpCommand(["mcp", "--help"]));
		expect(stdout).toContain("Usage:");
	});

	it("list shows no servers when none configured", async () => {
		const { stdout } = await captureOutput(() => handleMcpCommand(["mcp", "list"]));
		expect(stdout).toContain("No MCP servers configured");
	});

	it("add writes server to .mcp.json", async () => {
		const { stdout, exitCode } = await captureOutput(() =>
			handleMcpCommand(["mcp", "add", "myserver", "--command", "node", "server.js"]),
		);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Added MCP server");

		// Verify the file was written
		const config = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
		expect(config.mcpServers.myserver).toBeDefined();
		expect(config.mcpServers.myserver.transport.command).toBe("node");
		expect(config.mcpServers.myserver.transport.args).toEqual(["server.js"]);
	});

	it("add with --url creates HTTP transport", async () => {
		const { exitCode } = await captureOutput(() =>
			handleMcpCommand(["mcp", "add", "apiserver", "--url", "https://api.example.com/mcp"]),
		);
		expect(exitCode).toBe(0);

		const config = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
		expect(config.mcpServers.apiserver.transport.url).toBe("https://api.example.com/mcp");
	});

	it("list shows configured servers", async () => {
		await writeFile(
			join(cwd, ".mcp.json"),
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					testserver: { transport: { type: "stdio", command: "echo" } },
				},
			}),
		);

		const { stdout } = await captureOutput(() => handleMcpCommand(["mcp", "list"]));
		expect(stdout).toContain("testserver");
		expect(stdout).toContain("stdio");
	});

	it("list --json outputs JSON", async () => {
		await writeFile(
			join(cwd, ".mcp.json"),
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					testserver: { transport: { type: "stdio", command: "echo" } },
				},
			}),
		);

		const { stdout } = await captureOutput(() => handleMcpCommand(["mcp", "list", "--json"]));
		const parsed = JSON.parse(stdout);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].name).toBe("testserver");
	});

	it("remove deletes server from .mcp.json", async () => {
		await writeFile(
			join(cwd, ".mcp.json"),
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {
					testserver: { transport: { type: "stdio", command: "echo" } },
					keep: { transport: { type: "stdio", command: "cat" } },
				},
			}),
		);

		const { stdout, exitCode } = await captureOutput(() => handleMcpCommand(["mcp", "remove", "testserver"]));
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Removed");

		const config = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
		expect(config.mcpServers.testserver).toBeUndefined();
		expect(config.mcpServers.keep).toBeDefined();
	});

	it("remove fails for non-existent server", async () => {
		await writeFile(
			join(cwd, ".mcp.json"),
			JSON.stringify({
				mcpConfigVersion: 1,
				mcpServers: {},
			}),
		);

		const { stderr, exitCode } = await captureOutput(() => handleMcpCommand(["mcp", "remove", "nonexistent"]));
		expect(exitCode).toBe(1);
		expect(stderr).toContain("not found");
	});

	it("rejects add without command or url", async () => {
		const { stderr, exitCode } = await captureOutput(() => handleMcpCommand(["mcp", "add", "myserver"]));
		expect(exitCode).toBe(1);
		expect(stderr).toContain("required");
	});

	it("rejects unknown verb", async () => {
		const { stderr, exitCode } = await captureOutput(() => handleMcpCommand(["mcp", "bogus"]));
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Unknown mcp verb");
	});
});
