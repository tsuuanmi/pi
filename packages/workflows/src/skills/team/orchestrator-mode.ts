export type TeamOrchestratorMode = "off" | "on";

export function normalizeTeamOrchestratorMode(value: unknown): TeamOrchestratorMode {
	if (value === undefined) return "off";
	if (value === "off" || value === "on") return value;
	throw new Error(`Invalid team orchestrator mode: ${String(value)}`);
}
