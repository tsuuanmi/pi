// Architecture adapted from open-multi-agent (MIT).
import { Agent, type AgentOptions } from "@tsuuanmi/pi-agent";
import { type Message, MessageBus, type MessageBusSnapshot } from "#orchestrator/team/messaging";

export interface TeamOptions {
	readonly name: string;
	readonly agents?: readonly (Agent | AgentOptions)[];
}

export type TeamEventName = "message" | "broadcast";

export interface TeamEvent {
	readonly type: TeamEventName;
	readonly agent: string;
	readonly message: Message;
}

type TeamEventHandler = (event: TeamEvent) => void;

function cloneMessage(message: Message): Message {
	return {
		...message,
		timestamp: new Date(message.timestamp),
	};
}

export class Team {
	readonly name: string;
	private readonly agents = new Map<string, Agent>();
	private readonly messages = new MessageBus();
	private readonly listeners = new Map<TeamEventName, Map<symbol, TeamEventHandler>>();

	constructor(options: TeamOptions) {
		this.name = options.name;
		for (const agent of options.agents ?? []) this.addAgent(agent);
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

	sendMessage(from: string, to: string, content: string): Message {
		this.requireAgent(from);
		if (to !== "*") this.requireAgent(to);
		const message = this.messages.send(from, to, content);
		this.emit(message.to === "*" ? "broadcast" : "message", {
			type: message.to === "*" ? "broadcast" : "message",
			agent: from,
			message: cloneMessage(message),
		});
		return message;
	}

	broadcast(from: string, content: string): Message {
		return this.sendMessage(from, "*", content);
	}

	getMessages(agentName: string): readonly Message[] {
		this.requireAgent(agentName);
		return this.messages.getAll(agentName);
	}

	getUnreadMessages(agentName: string): readonly Message[] {
		this.requireAgent(agentName);
		return this.messages.getUnread(agentName);
	}

	markMessagesRead(agentName: string, messageIds: readonly string[]): void {
		this.requireAgent(agentName);
		this.messages.markRead(agentName, messageIds);
	}

	getConversation(agent1: string, agent2: string): readonly Message[] {
		this.requireAgent(agent1);
		this.requireAgent(agent2);
		return this.messages.getConversation(agent1, agent2);
	}

	subscribe(agentName: string, callback: (message: Message) => void): () => void {
		this.requireAgent(agentName);
		return this.messages.subscribe(agentName, callback);
	}

	snapshotMessageBus(): MessageBusSnapshot {
		return this.messages.snapshot();
	}

	restoreMessageBus(snapshot: MessageBusSnapshot): void {
		for (const message of snapshot.messages) {
			this.requireAgent(message.from);
			if (message.to !== "*") this.requireAgent(message.to);
		}
		for (const entry of snapshot.readState) this.requireAgent(entry.agentName);
		this.messages.restore(snapshot);
	}

	on(event: TeamEventName, handler: TeamEventHandler): () => void {
		let map = this.listeners.get(event);
		if (!map) {
			map = new Map();
			this.listeners.set(event, map);
		}
		const id = Symbol();
		map.set(id, handler);
		return () => {
			map!.delete(id);
		};
	}

	private emit(event: TeamEventName, payload: TeamEvent): void {
		if (event !== payload.type) throw new Error(`Team event mismatch: ${event} !== ${payload.type}`);
		const map = this.listeners.get(event);
		if (!map) return;
		for (const handler of map.values()) handler(payload);
	}

	private requireAgent(name: string): Agent {
		const agent = this.agents.get(name);
		if (!agent) throw new Error(`Unknown agent: ${name}`);
		return agent;
	}
}
