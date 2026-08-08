import { describe, expect, test } from "vitest";
import { type ProfileWorker, ProfileWorkerPool } from "../../src/worker/pool.ts";

function worker(): ProfileWorker {
	return {
		open: async () => {},
		start: () => {},
		cancel: () => {},
		resolveMcp: () => {},
		close: async () => {},
	};
}

const turn = {
	id: "turn",
	provider: "test",
	model: "model",
	prompt: "",
	attachments: [],
	tools: [],
	capability: "capability",
};

const start = (pool: ProfileWorkerPool, id = turn.id, profileDir = "/profile", secret = "secret") =>
	pool.start("profile", profileDir, secret, "/worker.js", { ...turn, id }, () => {});

describe("ProfileWorkerPool", () => {
	test("reuses one worker per profile and closes it once", async () => {
		let created = 0;
		let closed = 0;
		const pool = new ProfileWorkerPool(() => {
			created += 1;
			return {
				...worker(),
				close: async () => {
					closed += 1;
				},
			};
		});
		await start(pool);
		await start(pool, "turn-2");
		await pool.close("profile");
		expect(created).toBe(1);
		expect(closed).toBe(1);
	});

	test("rejects duplicate turns and changed profile paths", async () => {
		const pool = new ProfileWorkerPool(() => worker());
		await start(pool);
		await expect(start(pool)).rejects.toThrow("already running");
		await expect(start(pool, "turn-2", "/other")).rejects.toThrow("profile path changed");
		await expect(start(pool, "turn-2", "/profile", "other-secret")).rejects.toThrow("tunnel secret changed");
	});

	test("fails active turns and blocks restart after worker crash", async () => {
		let crash: ((error: Error) => void) | undefined;
		const messages: string[] = [];
		const pool = new ProfileWorkerPool((_profileId, _profileDir, _tunnelSecret, _workerPath, _onMessage, onCrash) => {
			crash = onCrash;
			return worker();
		});
		await pool.start("profile", "/profile", "secret", "/worker.js", turn, (message) => {
			if (message.type === "error") messages.push(message.message);
		});
		crash?.(new Error("browser crashed"));
		expect(messages).toEqual(["browser crashed"]);
		await expect(start(pool, "turn-2")).rejects.toThrow("profile worker is unavailable");
		await pool.close("profile");
	});
});
