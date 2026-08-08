import { parentPort } from "node:worker_threads";
import type { WebProviderDescriptor } from "../types.ts";
import { tunnelProof } from "./auth.ts";
import type { WorkerMessage, WorkerRequest } from "./protocol.ts";
import { WorkerSession } from "./session.ts";

export function startWorker(descriptor: WebProviderDescriptor): void {
	if (!parentPort) throw new Error("web worker requires a parent port");
	const port = parentPort;
	let session: WorkerSession | undefined;
	let profileId: string | undefined;
	let closing = false;

	const post = (message: WorkerMessage): void => port.postMessage(message);
	const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
	const postTurnError = (turnId: string, error: unknown): void =>
		post({ type: "error", turnId, message: errorMessage(error) });

	const handle = async (request: WorkerRequest): Promise<void> => {
		if (request.type === "open-profile") {
			if (session || profileId) {
				post({ type: "profile-error", message: "profile is already open" });
				return;
			}
			try {
				if (!request.tunnelSecret) throw new Error("profile tunnel secret is missing");
				profileId = request.profileId;
				session = await WorkerSession.open(request.profileDir, descriptor);
				post({
					type: "profile-ready",
					profileId: request.profileId,
					proof: tunnelProof(request.profileId, request.profileDir, request.tunnelSecret),
				});
			} catch (error) {
				profileId = undefined;
				session = undefined;
				post({ type: "profile-error", message: errorMessage(error) });
			}
			return;
		}

		if (request.type === "close-profile") {
			if (closing) return;
			closing = true;
			try {
				await session?.close();
				post({ type: "profile-closed" });
			} catch (error) {
				post({ type: "profile-error", message: errorMessage(error) });
				post({ type: "profile-closed" });
			}
			return;
		}

		if (closing) {
			if (request.type === "start-turn") postTurnError(request.turn.id, new Error("profile is closing"));
			return;
		}

		if (!session) {
			if (request.type === "start-turn") postTurnError(request.turn.id, new Error("profile is not open"));
			return;
		}

		if (request.type === "cancel-turn") {
			session.cancel(request.turnId);
			return;
		}
		if (request.type === "mcp-response") {
			try {
				session.resolveMcp(request.turnId, request.message);
			} catch (error) {
				postTurnError(request.turnId, error);
			}
			return;
		}
		if (request.type === "start-turn") {
			void session
				.run(request.turn, post)
				.then(() => post({ type: "complete", turnId: request.turn.id }))
				.catch((error) => postTurnError(request.turn.id, error));
		}
	};

	port.on("message", (request: WorkerRequest) => {
		void handle(request).catch((error) => {
			if (request.type === "start-turn") postTurnError(request.turn.id, error);
			else post({ type: "profile-error", message: errorMessage(error) });
		});
	});
}
