import { randomUUID } from "node:crypto";
import {
	McpServerSession,
	type WebAttachment,
	type WebTool,
	type WebTurnEvent,
	type WorkerMessage,
	type WorkerTurn,
} from "@tsuuanmi/pi-web-runtime";
import type { BrowserCredential } from "#pi/auth/types";
import { getBrowserProfilePath } from "#pi/web-providers/accounts";
import { webWorkers } from "./workers.ts";

const CAPABILITY_LIFETIME_MS = 300_000;

interface WebProviderResolver {
	get(provider: string): { readonly models: readonly { id: string }[] } | undefined;
	getWorkerPath(provider: string): string | undefined;
	getEntitlement(provider: string, account: string): readonly string[] | undefined;
}

export interface WebTurnRequest {
	provider: string;
	account: string;
	credential: BrowserCredential;
	model: string;
	prompt: string;
	attachments: readonly WebAttachment[];
	tools: readonly WebTool[];
	executeTool(name: string, input: unknown): Promise<unknown>;
	onEvent(event: WebTurnEvent): Promise<void>;
	signal: AbortSignal;
}

export async function runWebTurn(host: WebProviderResolver, request: WebTurnRequest): Promise<void> {
	const descriptor = host.get(request.provider);
	const workerPath = host.getWorkerPath(request.provider);
	if (!descriptor || !workerPath) throw new Error(`unsupported web provider: ${request.provider}`);
	if (!descriptor.models.some((model) => model.id === request.model)) {
		throw new Error(`unsupported web provider model: ${request.model}`);
	}
	const routes = host.getEntitlement(request.provider, request.account);
	if (!routes?.includes(request.model)) throw new Error(`web provider model is not entitled: ${request.model}`);
	if (request.signal.aborted) throw request.signal.reason;

	const turnId = randomUUID();
	const profileId = request.credential.profileId;
	const mcp = await McpServerSession.open(request.tools, request.executeTool, (message) =>
		webWorkers.resolveMcp(profileId, turnId, message),
	);
	let capability: string | undefined;
	try {
		if (request.signal.aborted) throw request.signal.reason;
		capability = mcp.issue(turnId, CAPABILITY_LIFETIME_MS);
		mcp.bind_turn(turnId, capability);
		const turn: WorkerTurn = {
			id: turnId,
			provider: request.provider,
			model: request.model,
			prompt: request.prompt,
			attachments: request.attachments,
			tools: request.tools,
			capability,
		};
		await runWorker(
			workerPath,
			profileId,
			request.credential.tunnelSecret,
			turn,
			mcp,
			request.onEvent,
			request.signal,
		);
	} finally {
		if (capability) {
			mcp.revoke(capability);
			mcp.revokeTurn(turnId);
		}
		await mcp.close();
	}
}

async function runWorker(
	workerPath: string,
	profileId: string,
	tunnelSecret: string,
	turn: WorkerTurn,
	mcp: McpServerSession,
	onEvent: (event: WebTurnEvent) => Promise<void>,
	signal: AbortSignal,
): Promise<void> {
	const profileDir = getBrowserProfilePath(profileId);
	await new Promise<void>((resolve, reject) => {
		let settled = false;
		let eventChain = Promise.resolve();
		const finish = (error?: Error): void => {
			if (settled) return;
			settled = true;
			signal.removeEventListener("abort", onAbort);
			if (error) reject(error);
			else resolve();
		};
		const onAbort = (): void => {
			webWorkers.cancel(profileId, turn.id);
			finish(signal.reason instanceof Error ? signal.reason : new Error("web provider turn canceled"));
		};
		const onMessage = (message: WorkerMessage): void => {
			if (settled) return;
			if (message.type === "complete") {
				void eventChain.then(
					() => finish(),
					(error: unknown) => finish(error instanceof Error ? error : new Error(String(error))),
				);
				return;
			}
			if (message.type === "error") {
				finish(new Error(message.message));
				return;
			}
			if (message.type === "mcp-request") {
				try {
					mcp.deliver(message.message);
				} catch (error) {
					webWorkers.cancel(profileId, turn.id);
					finish(error instanceof Error ? error : new Error(String(error)));
				}
				return;
			}
			if (message.type !== "event") return;
			eventChain = eventChain.then(() => onEvent(message.event));
			void eventChain.catch((error: unknown) => {
				webWorkers.cancel(profileId, turn.id);
				finish(error instanceof Error ? error : new Error(String(error)));
			});
		};
		if (signal.aborted) {
			finish(signal.reason instanceof Error ? signal.reason : new Error("web provider turn canceled"));
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
		void webWorkers
			.start(profileId, profileDir, tunnelSecret, workerPath, turn, onMessage)
			.then(() => {
				if (settled || signal.aborted) webWorkers.cancel(profileId, turn.id);
			})
			.catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
	});
}
