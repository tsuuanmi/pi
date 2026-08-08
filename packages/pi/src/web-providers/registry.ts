import type { AuthStorage } from "#pi/auth/storage";
import type { ProviderConfigInput } from "#pi/loader/model-registry";
import type { EntitledWebModel } from "#pi/web-providers/models";

type WebStreamFactory = (provider: string) => NonNullable<ProviderConfigInput["stream"]>;

interface WebProviderSource {
	getActiveModels(authStorage: AuthStorage): readonly EntitledWebModel[];
}

interface ProviderRegistry {
	registerProvider(name: string, config: ProviderConfigInput): void;
	unregisterProvider(name: string): void;
}

export class WebProviderRegistry {
	private readonly host: WebProviderSource;
	private readonly authStorage: AuthStorage;
	private readonly modelRegistry: ProviderRegistry;
	private readonly createStream: WebStreamFactory;
	private registered = new Set<string>();

	constructor(
		host: WebProviderSource,
		authStorage: AuthStorage,
		modelRegistry: ProviderRegistry,
		createStream: WebStreamFactory,
	) {
		this.host = host;
		this.authStorage = authStorage;
		this.modelRegistry = modelRegistry;
		this.createStream = createStream;
	}

	sync(): void {
		this.clear();
		try {
			const groups = new Map<string, EntitledWebModel[]>();
			for (const model of this.host.getActiveModels(this.authStorage)) {
				const models = groups.get(model.provider) ?? [];
				models.push(model);
				groups.set(model.provider, models);
			}
			for (const [provider, models] of groups) {
				for (const { model } of models) {
					if (!model.input.includes("text"))
						throw new Error(`web model does not support text input: ${provider}/${model.id}`);
				}
				this.modelRegistry.registerProvider(provider, {
					api: "web",
					stream: this.createStream(provider),
					models: models.map(({ model }) => ({
						id: model.id,
						name: model.name,
						reasoning: model.output.includes("reasoning"),
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: model.contextWindow,
						maxTokens: 16384,
					})),
				});
				this.registered.add(provider);
			}
		} catch (error) {
			this.clear();
			throw error;
		}
	}

	clear(): void {
		for (const provider of this.registered) this.modelRegistry.unregisterProvider(provider);
		this.registered.clear();
	}
}
