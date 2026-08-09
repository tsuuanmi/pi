import type { QueueMode } from "#agent/config";
import type { Message } from "#agent/messages/types";

export class MessageQueue {
	private messages: Message[] = [];
	mode: QueueMode;

	constructor(mode: QueueMode) {
		this.mode = mode;
	}

	enqueue(message: Message): void {
		this.messages.push(message);
	}

	hasItems(): boolean {
		return this.messages.length > 0;
	}

	drain(): Message[] {
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
