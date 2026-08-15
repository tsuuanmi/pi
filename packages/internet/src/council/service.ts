import type { AgentSessionServices } from "@tsuuanmi/pi";
import { Agent } from "@tsuuanmi/pi-agent";
import { type Api, type Model, stream as streamModel } from "@tsuuanmi/pi-ai";
import { Orchestrator, type TaskInput, Team } from "@tsuuanmi/pi-orchestrator";
import { internetProviderName } from "#internet/backends/registry";
import type { InternetAccount } from "#internet/core/types";

export type CouncilPreset = "quick" | "balanced" | "deep";

export interface CouncilRequest {
	question: string;
	preset: CouncilPreset;
	members?: string[];
	chair?: string;
	signal?: AbortSignal;
}

export interface CouncilMemberResult {
	model: string;
	response: string;
}

export interface CouncilResult {
	answer: string;
	members: CouncilMemberResult[];
	chair: string;
	preset: CouncilPreset;
}

const presetMembers: Record<CouncilPreset, number> = { quick: 2, balanced: 3, deep: 4 };
const maxMembers = 6;
const maxOutputTokens = 4_096;
const maxRunMs = 10 * 60_000;

function modelKey(model: Pick<Model<Api>, "provider" | "id">): string {
	return `${model.provider}/${model.id}`;
}

function selectModels(
	services: AgentSessionServices,
	providerNames: ReadonlySet<string>,
	request: CouncilRequest,
): Model<Api>[] {
	const available = services.modelRegistry.getAvailable().filter((model) => providerNames.has(model.provider));
	const byKey = new Map(available.map((model) => [modelKey(model), model]));
	if (request.members) {
		if (request.members.length < 2 || request.members.length > maxMembers) {
			throw new Error(`Council members must contain between 2 and ${maxMembers} models.`);
		}
		if (new Set(request.members).size !== request.members.length) throw new Error("Council members must be unique.");
		return request.members.map((selector) => {
			const model = byKey.get(selector);
			if (!model) throw new Error(`Council model is unavailable or not managed by internet: ${selector}`);
			return model;
		});
	}
	if (available.length < 2) {
		throw new Error("Council requires at least two available models from enabled internet accounts.");
	}
	const selected: Model<Api>[] = [];
	const selectedProviders = new Set<string>();
	for (const model of available) {
		if (selectedProviders.has(model.provider)) continue;
		selected.push(model);
		selectedProviders.add(model.provider);
		if (selected.length === presetMembers[request.preset]) return selected;
	}
	for (const model of available) {
		if (selected.includes(model)) continue;
		selected.push(model);
		if (selected.length === presetMembers[request.preset]) break;
	}
	return selected;
}

function createCouncilAgent(
	name: string,
	model: Model<Api>,
	systemPrompt: string,
	services: AgentSessionServices,
): Agent {
	return new Agent({
		name,
		initialState: {
			systemPrompt,
			model,
			thinkingLevel: model.reasoning ? "medium" : "off",
			tools: [],
		},
		maxTurns: 1,
		requestTimeoutMs: maxRunMs,
		stream: async (selectedModel, context, options) => {
			const auth = await services.modelRegistry.getApiKeyAndHeaders(selectedModel);
			if (!auth.ok) throw new Error(auth.error);
			const streamOptions = options ?? {};
			return streamModel(selectedModel, context, {
				...streamOptions,
				apiKey: auth.apiKey,
				headers: { ...auth.headers, ...streamOptions.headers },
				maxTokens: Math.min(streamOptions.maxTokens ?? maxOutputTokens, maxOutputTokens),
			});
		},
	});
}

export class CouncilService {
	private readonly providerNames: ReadonlySet<string>;

	constructor(accounts: InternetAccount[]) {
		this.providerNames = new Set(accounts.filter((account) => account.enabled).map(internetProviderName));
	}

	async run(request: CouncilRequest, services: AgentSessionServices): Promise<CouncilResult> {
		const models = selectModels(services, this.providerNames, request);
		const chairModel = request.chair
			? services.modelRegistry.getAvailable().find((model) => modelKey(model) === request.chair)
			: models[0];
		if (!chairModel || !this.providerNames.has(chairModel.provider)) {
			throw new Error(`Council chair is unavailable or not managed by internet: ${request.chair ?? "default"}`);
		}
		const members = models.map((model, index) => ({
			model,
			modelKey: modelKey(model),
			taskId: `member-${index + 1}`,
			agentName: `council-member-${index + 1}`,
		}));
		const memberPrompt =
			"You are an independent council member. Analyze the question directly, state assumptions, and surface uncertainty. Do not defer to other members.";
		const agents = members.map((member) =>
			createCouncilAgent(member.agentName, member.model, memberPrompt, services),
		);
		const chairName = "council-chair";
		agents.push(
			createCouncilAgent(
				chairName,
				chairModel,
				"You are the council chair. Reconcile independent analyses, preserve material uncertainty, and produce one concise recommendation.",
				services,
			),
		);
		const memberTasks: TaskInput[] = members.map((member) => ({
			id: member.taskId,
			title: `Independent analysis by ${member.modelKey}`,
			description: request.question,
			assignee: member.agentName,
			maxRetries: 0,
		}));
		const synthesisId = "synthesis";
		const tasks: TaskInput[] = [
			...memberTasks,
			{
				id: synthesisId,
				title: "Council synthesis",
				description: request.question,
				assignee: chairName,
				dependsOn: members.map((member) => member.taskId),
				dependencyPayload: "output",
				maxRetries: 0,
			},
		];
		const orchestrator = new Orchestrator({
			maxConcurrency: Math.min(models.length, 3),
			runBudget: { maxTaskStarts: tasks.length, maxRunMs },
		});
		const result = await orchestrator.run(new Team({ name: "internet-council", agents }), tasks, {
			abortSignal: request.signal,
		});
		const synthesis = result.tasks.find((task) => task.id === synthesisId);
		if (!result.success || !synthesis?.result) {
			throw new Error(result.abortedReason ?? synthesis?.error ?? "Council did not produce a synthesis.");
		}
		return {
			answer: synthesis.result,
			members: members.map((member) => ({
				model: member.modelKey,
				response: result.tasks.find((task) => task.id === member.taskId)?.result ?? "",
			})),
			chair: modelKey(chairModel),
			preset: request.preset,
		};
	}
}
