import { describe, expect, it } from "vitest";
import { createTeamAgents } from "#workflows/skills/team/agent-adapter";
import { createFakeManager, createTeamContext } from "#workflows-test/team/fakes";

const sessionId = "agent-adapter-test";

function context() {
	return createTeamContext(
		createFakeManager(async () => {}),
		sessionId,
	);
}

describe("team agent adapter", () => {
	it("rejects an empty roster", () => {
		expect(() => createTeamAgents(context(), [])).toThrow("team agent roster requires at least one agent");
	});

	it("requires an active host model", () => {
		expect(() => createTeamAgents({ ...context(), model: undefined }, [{ id: "worker", profile: "worker" }])).toThrow(
			"team execution requires an active host model",
		);
	});

	it("seeds every agent with the host model", () => {
		const agents = createTeamAgents(context(), [{ id: "worker", profile: "worker" }]);

		expect(agents[0]?.state.model.id).toBe("test-model");
		expect(agents[0]?.state.model.provider).toBe("test");
	});

	it("rejects duplicate agent ids", () => {
		expect(() =>
			createTeamAgents(context(), [
				{ id: "worker", profile: "worker" },
				{ id: "worker", profile: "reviewer" },
			]),
		).toThrow("duplicate team agent id: worker");
	});

	it("rejects invalid agent identifiers", () => {
		expect(() => createTeamAgents(context(), [{ id: " worker", profile: "worker" }])).toThrow(
			"agent.id must not have surrounding whitespace",
		);
		expect(() => createTeamAgents(context(), [{ id: "worker", profile: " " }])).toThrow(
			"agent[worker].profile must be non-empty",
		);
	});

	it("preserves exact role capabilities", () => {
		const agents = createTeamAgents(context(), [
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
