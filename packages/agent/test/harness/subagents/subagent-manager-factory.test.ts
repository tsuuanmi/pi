import {
	clearSubagentManagerFactoryForTests,
	getSubagentManagerFactory,
	registerSubagentManagerFactory,
	type SubagentManager,
	type SubagentManagerFactoryContext,
} from "@tsuuanmi/pi-agent";
import { afterEach, describe, expect, it } from "vitest";

function mockSubagentManager(): SubagentManager & { calls: { method: string; args: unknown[] }[] } {
	const calls: { method: string; args: unknown[] }[] = [];
	const manager = {
		calls,
		spawn: async (req: unknown) => {
			calls.push({ method: "spawn", args: [req] });
			return { ok: true, record: { id: "sub-test", status: "running" } } as never;
		},
		resume: async (id: string, message: string, options: unknown) => {
			calls.push({ method: "resume", args: [id, message, options] });
			return { ok: true } as never;
		},
		steer: async (id: string, message: string, delivery: string, sessionId: string) => {
			calls.push({ method: "steer", args: [id, message, delivery, sessionId] });
			return { ok: true } as never;
		},
		pause: async (id: string, sessionId: string) => {
			calls.push({ method: "pause", args: [id, sessionId] });
			return { ok: true } as never;
		},
		cancel: async (id: string, sessionId: string) => {
			calls.push({ method: "cancel", args: [id, sessionId] });
			return { id, status: "cancelled" } as never;
		},
		read: async (id: string, sessionId: string) => {
			calls.push({ method: "read", args: [id, sessionId] });
			return { id, status: "running" } as never;
		},
		list: async (sessionId: string) => {
			calls.push({ method: "list", args: [sessionId] });
			return [] as never;
		},
		waitFor: async (id: string, options: unknown) => {
			calls.push({ method: "waitFor", args: [id, options] });
			return { ok: true, record: { id, status: "completed" } } as never;
		},
		dispose: async () => {
			calls.push({ method: "dispose", args: [] });
		},
	} as unknown as SubagentManager & { calls: { method: string; args: unknown[] }[] };
	return manager;
}

describe("SubagentManagerFactory registry", () => {
	afterEach(() => {
		clearSubagentManagerFactoryForTests();
	});

	it("register/get/clear the factory", () => {
		expect(getSubagentManagerFactory()).toBeUndefined();
		const factory = (_ctx: SubagentManagerFactoryContext) => mockSubagentManager();
		registerSubagentManagerFactory(factory);
		expect(getSubagentManagerFactory()).toBe(factory);
		clearSubagentManagerFactoryForTests();
		expect(getSubagentManagerFactory()).toBeUndefined();
	});

	it("factory can return a Promise that resolves to a SubagentManager", async () => {
		const manager = mockSubagentManager();
		registerSubagentManagerFactory(async () => manager);
		const factory = getSubagentManagerFactory();
		expect(factory).toBeDefined();
		const result = await factory!({ cwd: "/tmp" });
		expect(result).toBe(manager);
	});
});
