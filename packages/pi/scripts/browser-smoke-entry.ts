import { complete, createAssistantMessageEventStream, getModel, getProviders, Type } from "@tsuuanmi/pi-ai";
import {
	Agent,
	bashExecutionToText,
	convertToLlm,
	createCustomMessage,
	FileError,
	getOrThrow,
	ok,
	streamProxy,
	toError,
} from "@tsuuanmi/pi-agent";

// Keep this entry browser-safe. It is bundled by the check-browser-smoke script
// to catch accidental Node-only runtime imports in browser-facing package exports.
const model = getModel("anthropic", "claude-haiku-4-5");
const schema = Type.Object({ prompt: Type.String() });
const stream = createAssistantMessageEventStream();

const agent = new Agent({ initialState: { model } });
agent.steer({ role: "user", content: [{ type: "text", text: "queued" }], timestamp: 0 });
const result = getOrThrow(ok({ value: 1 }));
const customMessage = createCustomMessage("note", "hello", true, undefined, "2026-01-01T00:00:00.000Z");
const llmMessages = convertToLlm([customMessage]);

console.log(
	model.id,
	getProviders().length,
	typeof complete,
	schema.type,
	typeof stream.push,
	agent.hasQueuedMessages(),
	result.value,
	llmMessages.length,
	bashExecutionToText({
		role: "bashExecution",
		command: "echo ok",
		output: "ok",
		exitCode: 0,
		cancelled: false,
		truncated: false,
		timestamp: 0,
	}),
	new FileError("not_found", "missing").code,
	toError("boom").message,
	typeof streamProxy,
);
