import type { WebProviderModel } from "@tsuuanmi/pi-web-runtime";
import type { AuthStorage } from "#pi/auth/storage";

interface WebProviderRegistry {
	getEntitlement(provider: string, account: string): readonly string[] | undefined;
	list(): readonly { id: string; models: readonly WebProviderModel[] }[];
}

export interface EntitledWebModel {
	provider: string;
	model: WebProviderModel;
}

export function getEntitledWebModels(host: WebProviderRegistry, authStorage: AuthStorage): readonly EntitledWebModel[] {
	const models: EntitledWebModel[] = [];
	for (const descriptor of host.list()) {
		const account = authStorage.getActiveAccount(descriptor.id);
		if (!account || !authStorage.getBrowserAccount(descriptor.id, account)) continue;
		const entitlement = host.getEntitlement(descriptor.id, account);
		if (!entitlement) continue;
		const routes = new Set<string>();
		for (const route of entitlement) {
			if (routes.has(route)) throw new Error(`duplicate entitled route: ${descriptor.id}/${route}`);
			routes.add(route);
		}
		for (const route of routes) {
			const model = descriptor.models.find((candidate) => candidate.id === route);
			if (!model) throw new Error(`unknown entitled route: ${descriptor.id}/${route}`);
			models.push({ provider: descriptor.id, model });
		}
	}
	return models;
}
