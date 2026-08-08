import { existsSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { WebProviderDescriptor } from "@tsuuanmi/pi-web-runtime";
import type { AuthStorage } from "#pi/auth/storage";
import type { ResolvedResource } from "#pi/resources/types";
import { type EntitledWebModel, getEntitledWebModels } from "#pi/web-providers/models";
import { runWebTurn, type WebTurnRequest } from "#pi/web-providers/turn";
import { closeWebWorkers } from "./workers.ts";

interface LoadedProvider {
	descriptor: WebProviderDescriptor;
	workerPath: string;
}

function isDescriptor(value: unknown): value is WebProviderDescriptor {
	if (!value || typeof value !== "object") return false;
	const descriptor = value as Partial<WebProviderDescriptor>;
	return (
		typeof descriptor.id === "string" &&
		typeof descriptor.name === "string" &&
		Array.isArray(descriptor.models) &&
		typeof descriptor.worker === "string" &&
		descriptor.worker.startsWith("./") &&
		typeof descriptor.verify === "function" &&
		typeof descriptor.runTurn === "function"
	);
}

function resolveWorkerPath(resourcePath: string, worker: string): string {
	const extension = extname(resourcePath);
	if (extension !== ".js" && extension !== ".ts") throw new Error(`unsupported web provider module: ${resourcePath}`);
	const directory = dirname(resourcePath);
	const workerPath = resolve(directory, `${worker}${extension}`);
	if (relative(directory, workerPath).startsWith(".."))
		throw new Error("web provider worker must be relative to its descriptor");
	if (!existsSync(workerPath)) throw new Error(`web provider worker is missing: ${workerPath}`);
	return workerPath;
}

/** Loads host-neutral descriptors and resolves their private worker entries. */
export class WebProviderHost {
	private providers = new Map<string, LoadedProvider>();
	private entitlements = new Map<string, Map<string, readonly string[]>>();
	private errors: Error[] = [];

	async load(resources: readonly ResolvedResource[]): Promise<void> {
		await closeWebWorkers();
		const providers = new Map<string, LoadedProvider>();
		const errors: Error[] = [];
		for (const resource of resources) {
			try {
				const module = (await import(pathToFileURL(resource.path).href)) as Record<string, unknown>;
				const descriptor = module.default;
				if (!isDescriptor(descriptor)) throw new Error("web provider module has no valid descriptor export");
				if (providers.has(descriptor.id)) throw new Error(`duplicate web provider descriptor: ${descriptor.id}`);
				providers.set(descriptor.id, {
					descriptor,
					workerPath: resolveWorkerPath(resource.path, descriptor.worker),
				});
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)));
			}
		}
		this.errors = errors;
		if (errors.length > 0) {
			this.providers = new Map();
			this.entitlements = new Map();
			throw new AggregateError(errors, "failed to load web provider descriptors");
		}
		this.providers = providers;
		this.entitlements = new Map();
	}

	async verify(id: string, profileDir: string, signal: AbortSignal): Promise<{ routes: readonly string[] }> {
		const provider = this.providers.get(id);
		if (!provider) throw new Error(`unsupported web provider: ${id}`);
		return provider.descriptor.verify(profileDir, signal);
	}

	async runTurn(request: WebTurnRequest): Promise<void> {
		await runWebTurn(this, request);
	}

	get(id: string): WebProviderDescriptor | undefined {
		return this.providers.get(id)?.descriptor;
	}

	getWorkerPath(id: string): string | undefined {
		return this.providers.get(id)?.workerPath;
	}

	setEntitlement(provider: string, account: string, routes: readonly string[]): void {
		if (!this.providers.has(provider)) throw new Error(`unsupported web provider: ${provider}`);
		if (routes.length === 0) throw new Error("web provider entitlement has no routes");
		const accounts = this.entitlements.get(provider) ?? new Map<string, readonly string[]>();
		accounts.set(account, [...routes]);
		this.entitlements.set(provider, accounts);
	}

	clearEntitlement(provider: string, account?: string): void {
		if (account === undefined) {
			this.entitlements.delete(provider);
			return;
		}
		const accounts = this.entitlements.get(provider);
		accounts?.delete(account);
		if (accounts?.size === 0) this.entitlements.delete(provider);
	}

	getEntitlement(provider: string, account: string): readonly string[] | undefined {
		return this.entitlements.get(provider)?.get(account);
	}

	getActiveModels(authStorage: AuthStorage): readonly EntitledWebModel[] {
		return getEntitledWebModels(this, authStorage);
	}

	list(): readonly WebProviderDescriptor[] {
		return [...this.providers.values()].map((provider) => provider.descriptor);
	}

	getErrors(): readonly Error[] {
		return this.errors;
	}
}
