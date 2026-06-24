import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAgentDefinitions } from "../../src/core/agent-definitions.ts";

function agentMd(name: string, description = `${name} description`, body = `${name} body`): string {
	return `---
name: ${name}
description: ${description}
---
${body}`;
}

describe("agent definitions", () => {
	let tempDir: string;
	let home: string;
	let cwd: string;
	let agentDir: string;
	let originalHome: string | undefined;

	beforeEach(() => {
		tempDir = join(tmpdir(), `agent-defs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		home = join(tempDir, "home");
		cwd = join(home, "project", "subdir");
		agentDir = join(home, ".pi", "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		originalHome = process.env.HOME;
		process.env.HOME = home;
	});

	afterEach(() => {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("loads user markdown agents and bundled role agents", () => {
		const userAgents = join(home, ".agent", "agents");
		mkdirSync(userAgents, { recursive: true });
		writeFileSync(join(userAgents, "foo.md"), agentMd("foo"));

		const result = loadAgentDefinitions({ cwd, agentDir, projectTrusted: false });
		const names = result.profiles.map((profile) => profile.name);

		expect(names).toContain("foo");
		expect(names).toEqual(expect.arrayContaining(["planner", "architect", "critic", "worker"]));
		expect(result.profiles.find((profile) => profile.name === "foo")?.systemPrompt).toBe("foo body");
	});

	it("loads trusted project markdown before user and bundled agents", () => {
		const projectRoot = join(home, "project");
		mkdirSync(join(projectRoot, ".git"), { recursive: true });
		const projectAgents = join(projectRoot, ".agent", "agents");
		const userAgents = join(home, ".agent", "agents");
		mkdirSync(projectAgents, { recursive: true });
		mkdirSync(userAgents, { recursive: true });
		writeFileSync(join(projectAgents, "worker.md"), agentMd("worker", "project worker", "project worker body"));
		writeFileSync(join(userAgents, "worker.md"), agentMd("worker", "user worker", "user worker body"));

		const result = loadAgentDefinitions({ cwd, agentDir, projectTrusted: true });
		const worker = result.profiles.find((profile) => profile.name === "worker");

		expect(worker?.description).toBe("project worker");
		expect(
			result.diagnostics.some(
				(diagnostic) => diagnostic.type === "collision" && diagnostic.collision?.name === "worker",
			),
		).toBe(true);
	});

	it("does not load project markdown when project is untrusted or double-count home as project", () => {
		const homeProjectAgents = join(home, ".agent", "agents");
		const nestedProjectAgents = join(cwd, ".agent", "agents");
		mkdirSync(homeProjectAgents, { recursive: true });
		mkdirSync(nestedProjectAgents, { recursive: true });
		writeFileSync(join(homeProjectAgents, "home-agent.md"), agentMd("home-agent"));
		writeFileSync(join(nestedProjectAgents, "project-agent.md"), agentMd("project-agent"));

		const result = loadAgentDefinitions({ cwd, agentDir, projectTrusted: false });
		const names = result.profiles.map((profile) => profile.name);

		expect(names).toContain("home-agent");
		expect(names).not.toContain("project-agent");
	});

	it("reports invalid and safety-reserved fields without shadowing later valid profiles", () => {
		const projectAgents = join(cwd, ".agent", "agents");
		const userAgents = join(home, ".agent", "agents");
		mkdirSync(projectAgents, { recursive: true });
		mkdirSync(userAgents, { recursive: true });
		writeFileSync(
			join(projectAgents, "foo.md"),
			`---
name: foo
description: project foo
forkContext: full
---
unsafe`,
		);
		writeFileSync(join(userAgents, "foo.md"), agentMd("foo", "user foo", "safe"));

		const result = loadAgentDefinitions({ cwd, agentDir, projectTrusted: true });
		const foo = result.profiles.find((profile) => profile.name === "foo");

		expect(foo?.description).toBe("user foo");
		expect(
			result.diagnostics.some(
				(diagnostic) => diagnostic.type === "error" && diagnostic.message.includes("forkContext"),
			),
		).toBe(true);
	});

	it("does not load legacy json profiles", () => {
		const jsonDir = join(agentDir, "agents");
		mkdirSync(jsonDir, { recursive: true });
		writeFileSync(join(jsonDir, "json-agent.json"), JSON.stringify({ description: "json", tools: ["read"] }));
		const projectJsonDir = join(cwd, ".pi", "agents");
		mkdirSync(projectJsonDir, { recursive: true });
		writeFileSync(join(projectJsonDir, "project-json.json"), JSON.stringify({ description: "json" }));

		const result = loadAgentDefinitions({ cwd, agentDir, projectTrusted: true });

		expect(result.profiles.some((profile) => profile.name === "json-agent")).toBe(false);
		expect(result.profiles.some((profile) => profile.name === "project-json")).toBe(false);
	});
});
