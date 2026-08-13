import { createHash } from "node:crypto";
import { registerProtectedSubagentPolicy, type SubagentRecord } from "@tsuuanmi/pi-orchestrator";
import { Type } from "typebox";
import type { WorkflowContext } from "#workflows/tool/context";
import type { WorkflowToolHost } from "#workflows/tool/host";

const RESEARCHER_POLICY_ID = "pi-workflows/researcher-v1";
const researcherPolicy = registerProtectedSubagentPolicy({
	policyId: RESEARCHER_POLICY_ID,
	protectedProfiles: ["researcher"],
	protectedRoles: ["researcher"],
});

export function registerResearcherTool(host: WorkflowToolHost): void {
	host.registerTool({
		name: "researcher_spawn",
		label: "Researcher Spawn",
		description: "Spawn a persistent, read-only external researcher with an exact registered ChatGPT Web model.",
		parameters: Type.Object({
			task: Type.String({ minLength: 1 }),
			model: Type.String({ minLength: 3, description: "Exact provider/model identifier." }),
			label: Type.Optional(Type.String({ minLength: 1 })),
			detached: Type.Optional(Type.Boolean()),
		}),
		async execute(_id, params, signal, _onUpdate, context) {
			const capability = researchCapability(context, params.model);
			const sessionId = context.sessionManager.getSessionId();
			const permit = researcherPolicy.issuePermit({
				operation: "spawn",
				sessionId,
				subject: { profile: "researcher", role: "researcher" },
				capabilitySnapshotDigest: capability.digest,
			});
			const result = await researcherPolicy.guardedSpawn(
				context.subagent,
				{
					agent: "researcher",
					role: "researcher",
					prompt: params.task,
					model: capability.model,
					tools: [],
					persistent: true,
					detached: params.detached,
					label: params.label,
					cwd: context.cwd,
					storageSessionId: sessionId,
					capabilitySnapshotDigest: capability.digest,
					signal,
				},
				permit,
			);
			return {
				content: [{ type: "text", text: result.output }],
				details: { id: result.record.id, status: result.record.status, record: result.record },
			};
		},
	});

	host.registerTool({
		name: "researcher_resume",
		label: "Researcher Resume",
		description: "Resume a protected persistent researcher after revalidating its configured research model.",
		parameters: Type.Object({ id: Type.String({ minLength: 1 }), message: Type.String({ minLength: 1 }) }),
		async execute(_id, params, signal, _onUpdate, context) {
			const sessionId = context.sessionManager.getSessionId();
			const record = await protectedResearcher(context, params.id, sessionId);
			const capability = researchCapability(context, requiredModel(record));
			const permit = researcherPolicy.issuePermit({
				operation: "resume",
				sessionId,
				subject: { subagentId: params.id },
				capabilitySnapshotDigest: capability.digest,
			});
			const result = await researcherPolicy.guardedResume(
				context.subagent,
				params.id,
				params.message,
				{ agent: "researcher", model: capability.model, tools: [], signal, storageSessionId: sessionId },
				permit,
				capability.digest,
			);
			return {
				content: [{ type: "text", text: researcherResultText(result) }],
				details: result,
			};
		},
	});

	host.registerTool({
		name: "researcher_steer",
		label: "Researcher Steer",
		description: "Steer a live protected researcher or resume it from saved context after capability revalidation.",
		parameters: Type.Object({ id: Type.String({ minLength: 1 }), message: Type.String({ minLength: 1 }) }),
		async execute(_id, params, _signal, _onUpdate, context) {
			const sessionId = context.sessionManager.getSessionId();
			const record = await protectedResearcher(context, params.id, sessionId);
			const capability = researchCapability(context, requiredModel(record));
			const permit = researcherPolicy.issuePermit({
				operation: "steer",
				sessionId,
				subject: { subagentId: params.id },
				capabilitySnapshotDigest: capability.digest,
			});
			const result = await researcherPolicy.guardedSteer(
				context.subagent,
				params.id,
				params.message,
				"steer",
				sessionId,
				permit,
				capability.digest,
			);
			return {
				content: [{ type: "text", text: researcherResultText(result) }],
				details: result,
			};
		},
	});
}

function researcherResultText(result: Awaited<ReturnType<typeof researcherPolicy.guardedResume>>): string {
	return result.ok ? result.result.output : result.reason;
}

async function protectedResearcher(context: WorkflowContext, id: string, sessionId: string): Promise<SubagentRecord> {
	const record = await context.subagent.read(id, sessionId);
	if (!record || record.protected_policy_id !== RESEARCHER_POLICY_ID || record.agent_profile !== "researcher") {
		throw new Error(`Protected researcher not found: ${id}`);
	}
	return record;
}

function researchCapability(context: WorkflowContext, value: string): { model: string; digest: string } {
	const separator = value.indexOf("/");
	if (separator < 1 || separator === value.length - 1) {
		throw new Error("Researcher model must be an exact provider/model identifier.");
	}
	const provider = value.slice(0, separator);
	const modelId = value.slice(separator + 1);
	const model = context.resolveModel(provider, modelId);
	if (!model || !isNativeResearchProvider(provider)) {
		throw new Error(`Research capability is unavailable for ${value}.`);
	}
	return {
		model: value,
		digest: createHash("sha256")
			.update(JSON.stringify({ provider: model.provider, id: model.id, profile: "researcher", tools: [] }))
			.digest("hex"),
	};
}

function requiredModel(record: SubagentRecord): string {
	if (!record.model) throw new Error(`Researcher ${record.id} has no persisted model.`);
	return record.model;
}

function isNativeResearchProvider(provider: string): boolean {
	return provider === "chatgpt-web" || provider.startsWith("chatgpt-web-");
}
