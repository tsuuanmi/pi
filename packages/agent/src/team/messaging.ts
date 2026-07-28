import { randomUUID } from "node:crypto";

export interface Message {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly content: string;
	readonly timestamp: Date;
}

export interface MessageSnapshot {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly content: string;
	readonly timestamp: string;
}

export interface MessageReadStateSnapshot {
	readonly agentName: string;
	readonly messageIds: readonly string[];
}

export interface MessageBusSnapshot {
	readonly version: 1;
	readonly messages: readonly MessageSnapshot[];
	readonly readState: readonly MessageReadStateSnapshot[];
}

function isAddressedTo(message: Message, agentName: string): boolean {
	if (message.to === "*") return message.from !== agentName;
	return message.to === agentName;
}

function cloneMessage(message: Message): Message {
	return {
		...message,
		timestamp: new Date(message.timestamp),
	};
}

export class MessageBus {
	private readonly messages: Message[] = [];
	private readonly readState = new Map<string, Set<string>>();
	private readonly subscribers = new Map<string, Map<symbol, (message: Message) => void>>();

	snapshot(): MessageBusSnapshot {
		return {
			version: 1,
			messages: this.messages.map((message) => ({
				...message,
				timestamp: message.timestamp.toISOString(),
			})),
			readState: Array.from(this.readState.entries()).map(([agentName, ids]) => ({
				agentName,
				messageIds: Array.from(ids),
			})),
		};
	}

	restore(snapshot: MessageBusSnapshot): void {
		if (snapshot.version !== 1) {
			throw new Error(`MessageBus.restore: unsupported snapshot version ${String(snapshot.version)}.`);
		}

		this.messages.splice(
			0,
			this.messages.length,
			...snapshot.messages.map((message) => ({
				...message,
				timestamp: new Date(message.timestamp),
			})),
		);
		this.readState.clear();
		for (const entry of snapshot.readState) {
			this.readState.set(entry.agentName, new Set(entry.messageIds));
		}
	}

	static fromSnapshot(snapshot: MessageBusSnapshot): MessageBus {
		const bus = new MessageBus();
		bus.restore(snapshot);
		return bus;
	}

	send(from: string, to: string, content: string): Message {
		const message: Message = {
			id: randomUUID(),
			from,
			to,
			content,
			timestamp: new Date(),
		};
		this.persist(message);
		return cloneMessage(message);
	}

	broadcast(from: string, content: string): Message {
		return this.send(from, "*", content);
	}

	getUnread(agentName: string): Message[] {
		const read = this.readState.get(agentName) ?? new Set<string>();
		return this.messages
			.filter((message) => isAddressedTo(message, agentName) && !read.has(message.id))
			.map(cloneMessage);
	}

	getAll(agentName: string): Message[] {
		return this.messages.filter((message) => isAddressedTo(message, agentName)).map(cloneMessage);
	}

	markRead(agentName: string, messageIds: readonly string[]): void {
		if (messageIds.length === 0) return;
		let read = this.readState.get(agentName);
		if (!read) {
			read = new Set<string>();
			this.readState.set(agentName, read);
		}
		for (const id of messageIds) {
			read.add(id);
		}
	}

	getConversation(agent1: string, agent2: string): Message[] {
		return this.messages
			.filter(
				(message) =>
					(message.from === agent1 && message.to === agent2) || (message.from === agent2 && message.to === agent1),
			)
			.map(cloneMessage);
	}

	subscribe(agentName: string, callback: (message: Message) => void): () => void {
		let agentSubs = this.subscribers.get(agentName);
		if (!agentSubs) {
			agentSubs = new Map();
			this.subscribers.set(agentName, agentSubs);
		}
		const id = Symbol();
		agentSubs.set(id, callback);
		return () => {
			agentSubs!.delete(id);
		};
	}

	private persist(message: Message): void {
		this.messages.push(message);
		this.notifySubscribers(message);
	}

	private notifySubscribers(message: Message): void {
		if (message.to !== "*") {
			this.fireCallbacks(message.to, message);
			return;
		}

		for (const [agentName, subs] of this.subscribers) {
			if (agentName !== message.from && subs.size > 0) {
				this.fireCallbacks(agentName, message);
			}
		}
	}

	private fireCallbacks(agentName: string, message: Message): void {
		const subs = this.subscribers.get(agentName);
		if (!subs) return;
		for (const callback of subs.values()) {
			callback(cloneMessage(message));
		}
	}
}
