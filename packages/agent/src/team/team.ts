// Architecture adapted from open-multi-agent (MIT).
import { Agent, type AgentOptions } from "#agent/agent/agent";

export class Team {
	readonly name: string;
	private readonly agents = new Map<string, Agent>();

	constructor(name: string, agents: readonly (Agent | AgentOptions)[] = []) {
		this.name = name;
		for (const agent of agents) this.addAgent(agent);
	}

	addAgent(agent: Agent | AgentOptions): Agent {
		const instance = agent instanceof Agent ? agent : new Agent(agent);
		if (this.agents.has(instance.name)) throw new Error(`Agent already exists: ${instance.name}`);
		this.agents.set(instance.name, instance);
		return instance;
	}

	getAgent(name: string): Agent | undefined {
		return this.agents.get(name);
	}

	getAgents(): readonly Agent[] {
		return [...this.agents.values()];
	}
}
