import { execFileSync } from "node:child_process";
import { isBlockingQuestionPhaseForSkill } from "#workflows/registry/skill-registry";
import type { WorkflowSkill } from "#workflows/session/paths";
import { getWorkflowSkillCommandNames } from "#workflows/skills/workflow-help-registry";

export function gitOutput(workspace: string, args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			cwd: workspace,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

export function inputString(input: Record<string, unknown>, key: string): string | undefined {
	const value = input[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requiredString(input: Record<string, unknown>, key: string): string {
	const value = inputString(input, key);
	if (value === undefined) throw new Error(`${key} is required`);
	return value;
}

export function optionalNumber(input: Record<string, unknown>, key: string): number | undefined {
	const value = input[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function requiredNumber(input: Record<string, unknown>, key: string): number {
	const value = optionalNumber(input, key);
	if (value === undefined) throw new Error(`${key} must be a finite number`);
	return value;
}

export function optionalStringArray(input: Record<string, unknown>, key: string): string[] | undefined {
	const value = input[key];
	if (!Array.isArray(value)) return undefined;
	return value.filter((item): item is string => typeof item === "string");
}

export function workflowVerbSet(skill: "deep-interview" | "ralplan" | "team" | "ultragoal"): Set<string> {
	return new Set(getWorkflowSkillCommandNames(skill));
}

export function requiredObject(input: Record<string, unknown>, key: string): Record<string, unknown> {
	const value = input[key];
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} must be an object`);
	return value as Record<string, unknown>;
}

function inputWorkflowSkill(input: Record<string, unknown>): WorkflowSkill | undefined {
	const skill = inputString(input, "skill");
	if (skill === "deep-interview" || skill === "ralplan" || skill === "team" || skill === "ultragoal") return skill;
	return undefined;
}

export function assertDetachedInteractiveAllowed(input: Record<string, unknown>, detachRequested: boolean): void {
	if (!detachRequested) return;
	const skill = inputWorkflowSkill(input);
	if (!skill) return;
	const phase = inputString(input, "phase") ?? inputString(input, "current_phase") ?? inputString(input, "status");
	if (!isBlockingQuestionPhaseForSkill(skill, phase)) return;
	throw new Error(
		`detached workflow refused: skill ${skill} is interactive and phase ${phase} requires a blocking user question; run attached or clear the blocking phase`,
	);
}

export function sessionIdFromInput(input: Record<string, unknown>): string {
	const sessionId = inputString(input, "sessionId") ?? inputString(input, "session");
	if (!sessionId) throw new Error("sessionId is required");
	return sessionId;
}

export function output(value: unknown, json: boolean): string {
	return json ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value)}\n`;
}
