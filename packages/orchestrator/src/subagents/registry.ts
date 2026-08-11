import type { AgentSessionServices } from "@tsuuanmi/pi";
import type { ExtensionContext } from "@tsuuanmi/pi/extensions";
import { SubagentManager } from "#orchestrator/subagents/manager";

interface RegisteredManager {
	manager: SubagentManager;
	services: AgentSessionServices;
}

const managers = new WeakMap<AgentSessionServices, SubagentManager>();
const sessionManagers = new Map<string, RegisteredManager>();

function sessionKey(cwd: string, sessionId: string): string {
	return `${cwd}\0${sessionId}`;
}

export function getSubagentManager(context: ExtensionContext): SubagentManager {
	const services = context.sessionServices;
	let manager = managers.get(services);
	if (!manager) {
		manager = new SubagentManager(services);
		managers.set(services, manager);
	}
	sessionManagers.set(sessionKey(context.cwd, context.sessionManager.getSessionId()), { manager, services });
	return manager;
}

export function getActiveSubagentCount(cwd: string, sessionId: string): number {
	return sessionManagers.get(sessionKey(cwd, sessionId))?.manager.getActiveCount() ?? 0;
}

export async function disposeSubagentManager(context: ExtensionContext): Promise<void> {
	const services = context.sessionServices;
	const manager = managers.get(services);
	if (!manager) return;
	managers.delete(services);
	const key = sessionKey(context.cwd, context.sessionManager.getSessionId());
	if (sessionManagers.get(key)?.manager === manager) sessionManagers.delete(key);
	await manager.dispose();
}
