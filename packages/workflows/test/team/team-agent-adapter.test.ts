import { describe, expect, it } from "vitest";
import { createTeamAgents } from "#workflows/skills/team/agent-adapter";
import { createFakeManager } from "#workflows-test/team/team-fakes";

const sessionId = "agent-adapter-test";

function manager() {
	return createFakeManager(async () => {});
}

describe("team agent adapter", () => {
	it("rejects an empty roster", () => {
		expect(() => createTeamAgents(manager(), sessionId, [])).toThrow("team agent roster requires at least one agent");
	});

	it("rejects duplicate agent ids", () => {
		expect(() =>
			createTeamAgents(manager(), sessionId, [
				{ id: "worker", profile: "worker" },
				{ id: "worker", profile: "reviewer" },
			]),
		).toThrow("duplicate team agent id: worker");
	});

	it("rejects invalid agent identifiers", () => {
		expect(() => createTeamAgents(manager(), sessionId, [{ id: " worker", profile: "worker" }])).toThrow(
			"agent.id must not have surrounding whitespace",
		);
		expect(() => createTeamAgents(manager(), sessionId, [{ id: "worker", profile: " " }])).toThrow(
			"agent[worker].profile must be non-empty",
		);
	});

	it("preserves exact role capabilities", () => {
		const agents = createTeamAgents(manager(), sessionId, [
			{ id: "worker", profile: "worker", capabilities: ["worker"] },
			{ id: "reviewer", profile: "reviewer", capabilities: ["reviewer"] },
			{ id: "prover", profile: "prover", capabilities: ["prover"] },
		]);

		expect(agents.map((agent) => ({ id: agent.name, capabilities: agent.capabilities }))).toEqual([
			{ id: "worker", capabilities: ["worker"] },
			{ id: "reviewer", capabilities: ["reviewer"] },
			{ id: "prover", capabilities: ["prover"] },
		]);
	});
});
