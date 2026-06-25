import { type Static, Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "../../api/types.ts";
import { deriveDeepInterviewHud } from "../deep-interview/deep-interview-hud.ts";
import { syncWorkflowActiveState } from "./active-state.ts";
import { workflowReceipt } from "./receipts.ts";
import { workflowStatePath } from "./session-layout.ts";
import { assertWorkflowSkill } from "./state-schema.ts";
import { clearWorkflowState, readWorkflowState, writeWorkflowState } from "./workflow-state.ts";

const workflowStateSchema = Type.Object({
	skill: Type.String({ description: "Workflow skill name: deep-interview, ralplan, team, or ultragoal" }),
	action: Type.Optional(Type.String({ description: "read, write, or clear. Defaults to read." })),
	phase: Type.Optional(Type.String({ description: "Phase to set for write/clear actions" })),
	active: Type.Optional(Type.Boolean({ description: "Active flag for write actions" })),
	data: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), { description: "State fields to merge for write actions" }),
	),
	force: Type.Optional(
		Type.Boolean({ description: "Force overwrite/clear of terminal or corrupt state. Defaults to false." }),
	),
});

type WorkflowStateInput = Static<typeof workflowStateSchema>;

async function executeWorkflowState(params: WorkflowStateInput, ctx: ExtensionContext) {
	const sessionId = ctx.sessionManager.getSessionId();
	assertWorkflowSkill(params.skill);
	const action = params.action ?? "read";
	if (action === "read") {
		const state = (await readWorkflowState(ctx.cwd, params.skill, { sessionId })) ?? null;
		return {
			content: [{ type: "text" as const, text: JSON.stringify({ state }, null, 2) }],
			details: workflowReceipt({ state, path: workflowStatePath(ctx.cwd, params.skill, sessionId) }),
		};
	}
	if (action === "write") {
		const patch: Record<string, unknown> = { ...(params.data ?? {}) };
		if (params.phase) patch.current_phase = params.phase;
		if (typeof params.active === "boolean") patch.active = params.active;
		const state = await writeWorkflowState(ctx.cwd, params.skill, patch, "pi workflow state write", {
			force: params.force,
			sessionId,
		});
		await syncWorkflowActiveState(
			ctx.cwd,
			{
				skill: params.skill,
				active: state.active,
				phase: state.current_phase,
				state_path: workflowStatePath(ctx.cwd, params.skill, sessionId),
				hud:
					params.skill === "deep-interview"
						? deriveDeepInterviewHud(state, { phase: state.current_phase })
						: undefined,
			},
			{ sessionId },
		);
		return {
			content: [{ type: "text" as const, text: `Updated ${workflowStatePath(ctx.cwd, params.skill, sessionId)}` }],
			details: workflowReceipt({ state, path: workflowStatePath(ctx.cwd, params.skill, sessionId) }),
		};
	}
	if (action === "clear") {
		const state = await clearWorkflowState(ctx.cwd, params.skill, params.data ?? {}, {
			force: params.force,
			sessionId,
		});
		await syncWorkflowActiveState(
			ctx.cwd,
			{
				skill: params.skill,
				active: state.active,
				phase: state.current_phase,
				state_path: workflowStatePath(ctx.cwd, params.skill, sessionId),
				hud:
					params.skill === "deep-interview"
						? deriveDeepInterviewHud(state, { phase: state.current_phase })
						: undefined,
			},
			{ sessionId },
		);
		return {
			content: [{ type: "text" as const, text: `Cleared ${params.skill} workflow state` }],
			details: workflowReceipt({ state, path: workflowStatePath(ctx.cwd, params.skill, sessionId) }),
		};
	}
	throw new Error(`unknown workflow state action: ${action}`);
}

export function syncMcpHudUi(ctx: ExtensionContext): void {
	const infos = ctx.getMcpServerInfos();
	if (infos.length === 0) {
		ctx.ui.setStatus("mcp", undefined);
		ctx.ui.setWidget("mcp", undefined);
		return;
	}
	const connected = infos.filter((info) => info.status === "connected");
	const failed = infos.filter((info) => info.status === "failed");
	const disconnected = infos.filter((info) => info.status === "disconnected");
	const toolCount = infos.reduce((sum, info) => sum + info.toolCount, 0);
	const summary = [
		`MCP ${connected.length}/${infos.length}`,
		`${toolCount} tool${toolCount === 1 ? "" : "s"}`,
		...(failed.length > 0 ? [`${failed.length} failed`] : []),
		...(disconnected.length > 0 ? [`${disconnected.length} disconnected`] : []),
	].join(" | ");
	ctx.ui.setStatus("mcp", summary);
	if (ctx.mode !== "tui") return;
	const lines = infos.map((info) => {
		const suffix = info.error ? ` — ${info.error}` : ` — ${info.toolCount} tool${info.toolCount === 1 ? "" : "s"}`;
		return `${info.name}: ${info.status}${suffix}`;
	});
	ctx.ui.setWidget("mcp", ["MCP", ...lines], { placement: "aboveEditor" });
}

export async function syncWorkflowHudUi(_ctx: ExtensionContext): Promise<void> {
	// The workflow HUD now renders from StatusLineComponent's background-refreshed
	// active-state cache. Keep these hook registrations for lifecycle coverage,
	// but do not mirror workflow data into extension status/widget slots.
}

export function registerWorkflowStateTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "pi_workflow_state",
		label: "Pi Workflow State",
		description: "Read, write, or clear Pi workflow state under .pi/workflows/<skill>/state.json.",
		promptSnippet: "Read/write Pi workflow state for deep-interview, ralplan, team, and ultragoal",
		promptGuidelines: ["Use pi_workflow_state instead of direct edits when reading or updating .pi/workflows state."],
		parameters: workflowStateSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeWorkflowState(params, ctx),
	});
}
