import type { QueueMode } from "#agent/config";
import type { AgentMessage } from "#agent/messages/types";

export class MessageQueue {
	private messages: AgentMessage[] = [];
	mode: QueueMode;

	constructor(mode: QueueMode) {
		this.mode = mode;
	}

	enqueue(message: AgentMessage): void {
		this.messages.push(message);
	}

	hasItems(): boolean {
		return this.messages.length > 0;
	}

	drain(): AgentMessage[] {
		if (this.mode === "all") {
			const messages = this.messages.slice();
			this.messages = [];
			return messages;
		}

		const message = this.messages[0];
		if (!message) return [];
		this.messages = this.messages.slice(1);
		return [message];
	}

	clear(): void {
		this.messages = [];
	}
}
