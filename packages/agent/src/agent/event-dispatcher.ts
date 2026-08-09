import type { MutableAgentState } from "#agent/agent/state";
import type { AgentEvent } from "#agent/events";

export type AgentListener = (event: AgentEvent, signal: AbortSignal) => Promise<void> | void;

export class AgentEventDispatcher {
	private readonly listeners = new Set<AgentListener>();
	private readonly state: MutableAgentState;
	private readonly getSignal: () => AbortSignal | undefined;

	constructor(state: MutableAgentState, getSignal: () => AbortSignal | undefined) {
		this.state = state;
		this.getSignal = getSignal;
	}

	subscribe(listener: AgentListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	clear(): void {
		this.listeners.clear();
	}

	async emitOutOfBand(event: AgentEvent): Promise<void> {
		const controller = new AbortController();
		for (const listener of this.listeners) await listener(event, controller.signal);
	}

	async process(event: AgentEvent): Promise<void> {
		applyEvent(this.state, event);
		const signal = this.getSignal();
		if (!signal) throw new Error("Agent listener invoked outside active run");
		for (const listener of this.listeners) await listener(event, signal);
	}
}

function applyEvent(state: MutableAgentState, event: AgentEvent): void {
	switch (event.type) {
		case "message_start":
		case "message_update":
			state.streamingMessage = event.message;
			break;
		case "message_end":
			state.streamingMessage = undefined;
			state.messages.push(event.message);
			break;
		case "tool_execution_start": {
			const pending = new Set(state.pendingToolCalls);
			pending.add(event.toolCallId);
			state.pendingToolCalls = pending;
			break;
		}
		case "tool_execution_end": {
			const pending = new Set(state.pendingToolCalls);
			pending.delete(event.toolCallId);
			state.pendingToolCalls = pending;
			break;
		}
		case "turn_end":
			if (event.message.role === "assistant" && event.message.errorMessage) {
				state.errorMessage = event.message.errorMessage;
			}
			break;
		case "agent_end":
			state.streamingMessage = undefined;
			break;
	}
}
