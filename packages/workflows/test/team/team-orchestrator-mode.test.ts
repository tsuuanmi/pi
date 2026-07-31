import { describe, expect, it } from "vitest";
import { normalizeTeamOrchestratorMode } from "#workflows/skills/team/orchestrator-mode";

describe("team orchestrator mode", () => {
	it("defaults missing mode to off", () => {
		expect(normalizeTeamOrchestratorMode(undefined)).toBe("off");
	});

	it("accepts explicit modes", () => {
		expect(normalizeTeamOrchestratorMode("off")).toBe("off");
		expect(normalizeTeamOrchestratorMode("on")).toBe("on");
	});

	it("rejects invalid strings", () => {
		expect(() => normalizeTeamOrchestratorMode("auto")).toThrow("Invalid team orchestrator mode: auto");
	});

	it("rejects non-string values", () => {
		expect(() => normalizeTeamOrchestratorMode(true)).toThrow("Invalid team orchestrator mode: true");
		expect(() => normalizeTeamOrchestratorMode(null)).toThrow("Invalid team orchestrator mode: null");
	});
});
