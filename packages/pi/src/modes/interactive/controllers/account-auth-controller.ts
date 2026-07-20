import {
	type Api,
	fetchOpenAICodexUsageSummary,
	getProviders,
	type Model,
	type OAuthProviderId,
	type OAuthSelectPrompt,
	type OpenAICodexUsageSummary,
} from "@tsuuanmi/pi-ai";
import type { Component, Container, EditorComponent, StatusLineComponent, TUI } from "@tsuuanmi/pi-tui";
import { getAuthPath } from "#pi/config/config";
import { defaultModelPerProvider } from "#pi/model/model-resolver";
import { BUILT_IN_PROVIDER_DISPLAY_NAMES } from "#pi/model/provider-utils";
import { LoginDialogComponent } from "#pi/modes/interactive/components/login-dialog";
import {
	AccountSelectorComponent,
	type AccountSelectorOption,
} from "#pi/modes/interactive/components/selectors/account-selector";
import { ExtensionSelectorComponent } from "#pi/modes/interactive/components/selectors/extension-selector";
import {
	type AuthSelectorProvider,
	OAuthSelectorComponent,
} from "#pi/modes/interactive/components/selectors/oauth-selector";
import type { FooterDataProvider } from "#pi/modes/interactive/footer-data-provider";
import type { AgentSession } from "#pi/session/agent-session";

function isUnknownModel(model: Model<any> | undefined): boolean {
	return !!model && model.provider === "unknown" && model.id === "unknown" && model.api === "unknown";
}

function hasDefaultModelProvider(providerId: string): providerId is keyof typeof defaultModelPerProvider {
	return providerId in defaultModelPerProvider;
}

const BUILT_IN_MODEL_PROVIDERS = new Set<string>(getProviders());

export function isApiKeyAccountProvider(
	providerId: string,
	oauthProviderIds: ReadonlySet<string>,
	builtInProviderIds: ReadonlySet<string> = BUILT_IN_MODEL_PROVIDERS,
): boolean {
	if (BUILT_IN_PROVIDER_DISPLAY_NAMES[providerId]) {
		return true;
	}
	if (builtInProviderIds.has(providerId)) {
		return false;
	}
	return !oauthProviderIds.has(providerId);
}

export class AccountAuthController {
	private readonly ui: TUI;
	private readonly editorContainer: Container;
	private readonly footer: StatusLineComponent;
	private readonly footerDataProvider: FooterDataProvider;
	private readonly getSession: () => AgentSession;
	private readonly getEditor: () => EditorComponent;
	private readonly agentDir: string;
	private readonly settingsManager: AgentSession["settingsManager"];
	private readonly showError: (errorMessage: string) => void;
	private readonly showStatus: (message: string) => void;
	private readonly showSelector: (create: (done: () => void) => { component: Component; focus: Component }) => void;
	private readonly updateEditorBorderColor: () => void;

	private get session(): AgentSession {
		return this.getSession();
	}
	private get editor(): EditorComponent {
		return this.getEditor();
	}

	constructor(opts: {
		ui: TUI;
		editorContainer: Container;
		footer: StatusLineComponent;
		footerDataProvider: FooterDataProvider;
		getSession: () => AgentSession;
		getEditor: () => EditorComponent;
		getSettingsManager: () => AgentSession["settingsManager"];
		agentDir: string;
		showError: (errorMessage: string) => void;
		showStatus: (message: string) => void;
		showSelector: (create: (done: () => void) => { component: Component; focus: Component }) => void;
		updateEditorBorderColor: () => void;
	}) {
		this.ui = opts.ui;
		this.editorContainer = opts.editorContainer;
		this.footer = opts.footer;
		this.footerDataProvider = opts.footerDataProvider;
		this.getSession = opts.getSession;
		this.getEditor = opts.getEditor;
		this.settingsManager = opts.getSettingsManager();
		this.agentDir = opts.agentDir;
		this.showError = opts.showError;
		this.showStatus = opts.showStatus;
		this.showSelector = opts.showSelector;
		this.updateEditorBorderColor = opts.updateEditorBorderColor;
	}

	private tokenizeCommand(text: string): string[] {
		const tokens: string[] = [];
		let current = "";
		let quote: '"' | "'" | undefined;
		let escaping = false;

		for (const char of text) {
			if (escaping) {
				current += char;
				escaping = false;
				continue;
			}
			if (char === "\\") {
				escaping = true;
				continue;
			}
			if (quote) {
				if (char === quote) {
					quote = undefined;
				} else {
					current += char;
				}
				continue;
			}
			if (char === '"' || char === "'") {
				quote = char;
				continue;
			}
			if (/\s/.test(char)) {
				if (current) {
					tokens.push(current);
					current = "";
				}
				continue;
			}
			current += char;
		}

		if (escaping) current += "\\";
		if (current) tokens.push(current);
		return tokens;
	}

	private parseProviderAddOptions(tokens: string[]): Map<string, string[]> {
		const options = new Map<string, string[]>();
		let positionalProviderId: string | undefined;
		for (let index = 2; index < tokens.length; index++) {
			const token = tokens[index];
			if (!token.startsWith("--")) {
				if (positionalProviderId) {
					throw new Error(`Unexpected argument: ${token}`);
				}
				positionalProviderId = token;
				continue;
			}

			const name = token.slice(2);
			const value = tokens[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error(`Missing value for --${name}`);
			}
			index++;
			options.set(name, [...(options.get(name) ?? []), value]);
		}
		if (positionalProviderId) {
			options.set("provider", [positionalProviderId, ...(options.get("provider") ?? [])]);
		}
		return options;
	}

	private normalizeProviderApi(options: Map<string, string[]>): Api {
		const api = options.get("api")?.[0];
		const compat = options.get("compat")?.[0];
		if (api && compat) {
			throw new Error("Use either --api or --compat, not both.");
		}

		const value = api ?? compat;
		if (value === "openai") return "openai-completions";
		if (value === "anthropic") return "anthropic-messages";
		if (value === "openai-completions" || value === "openai-responses" || value === "anthropic-messages") {
			return value;
		}
		throw new Error("Set --api to openai-completions, openai-responses, or anthropic-messages.");
	}

	handleProviderCommand(text: string): void {
		const tokens = this.tokenizeCommand(text);
		if (tokens[1] !== "add") {
			this.showStatus(
				"Usage: /provider add <provider> --api <openai-completions|openai-responses|anthropic-messages> --base-url <url> --model <model>",
			);
			return;
		}

		try {
			const options = this.parseProviderAddOptions(tokens);
			const providerId = options.get("provider")?.[0];
			const baseUrl = options.get("base-url")?.[0];
			const modelIds = options.get("model") ?? [];
			if (!providerId || !baseUrl || modelIds.length === 0) {
				throw new Error("Required: <provider>, --base-url <url>, and at least one --model <model>.");
			}

			const api = this.normalizeProviderApi(options);
			this.upsertModelsSetting(providerId, baseUrl, api, modelIds);

			this.session.modelRegistry.refresh();
			void this.updateAvailableProviderCount();
			this.footer.invalidate();
			this.updateEditorBorderColor();
			this.showStatus(`Added provider ${providerId}. Add keys with /account add ${providerId} <account>.`);
		} catch (error) {
			this.showError(`Provider add failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private upsertModelsSetting(providerId: string, baseUrl: string, api: Api, modelIds: string[]): void {
		const config = this.settingsManager.getModelsConfig() ?? {};
		const providers = config.providers ?? {};
		const existingProvider = providers[providerId] ?? {};
		const models = [...(existingProvider.models ?? [])];
		const existingModelIds = new Set(models.map((model) => model.id));
		for (const modelId of modelIds) {
			if (!existingModelIds.has(modelId)) {
				models.push({ id: modelId });
			}
		}

		this.settingsManager.upsertModelProvider(providerId, {
			...existingProvider,
			baseUrl,
			api,
			models,
		});
	}

	private findAccountProviderOption(providerId: string): AuthSelectorProvider | undefined {
		return this.getAccountProviderOptions().find((provider) => provider.id === providerId);
	}

	private async addProviderAccount(providerId: string, accountName?: string): Promise<void> {
		const providerOption = this.findAccountProviderOption(providerId);
		if (!providerOption) {
			this.showError(`Unknown account provider: ${providerId}`);
			return;
		}

		if (providerOption.authType === "oauth") {
			await this.showLoginDialog(providerOption.id, providerOption.name, accountName);
		} else {
			await this.showApiKeyLoginDialog(providerOption.id, providerOption.name, accountName);
		}
	}

	private buildAccountOptions(providerFilter?: string): AccountSelectorOption[] {
		const authStorage = this.session.modelRegistry.authStorage;
		const providers = authStorage.list().filter((provider) => !providerFilter || provider === providerFilter);
		return this.sortAccountOptions(
			providers.flatMap((providerId) => {
				const activeAccount = authStorage.getActiveAccount(providerId);
				return authStorage.getAccountNames(providerId).map((accountName) => ({
					providerId,
					providerName: this.session.modelRegistry.getProviderDisplayName(providerId),
					accountName,
					active: accountName === activeAccount,
					quotaText: providerId === "openai-codex" ? "loading" : undefined,
				}));
			}),
		);
	}

	private sortAccountOptions(options: AccountSelectorOption[]): AccountSelectorOption[] {
		return options.sort((a, b) => {
			if (a.active !== b.active) return a.active ? -1 : 1;
			const providerCompare = a.providerName.localeCompare(b.providerName);
			if (providerCompare !== 0) return providerCompare;
			const providerIdCompare = a.providerId.localeCompare(b.providerId);
			if (providerIdCompare !== 0) return providerIdCompare;
			return a.accountName.localeCompare(b.accountName);
		});
	}

	private getOpenAICodexQuotaModel(): Model<Api> | undefined {
		return this.session.modelRegistry.getAll().find((model) => model.provider === "openai-codex");
	}

	private async attachAccountQuota(options: AccountSelectorOption[]): Promise<AccountSelectorOption[]> {
		const codexOptions = options.filter((option) => option.providerId === "openai-codex");
		if (codexOptions.length === 0) return options;

		const model = this.getOpenAICodexQuotaModel();
		if (!model) {
			for (const option of codexOptions) option.quotaText = "unavailable";
			return options;
		}

		await Promise.all(
			codexOptions.map(async (option) => {
				const summary = await this.fetchAccountCodexQuota(model, option.accountName);
				if (!summary) {
					option.quotaText = "unavailable";
					return;
				}
				option.quotaText = summary.text;
				option.quotaStatus = summary.status === "unknown" ? undefined : summary.status;
			}),
		);
		return this.sortAccountOptions(options);
	}

	private async fetchAccountCodexQuota(
		model: Model<Api>,
		accountName: string,
	): Promise<OpenAICodexUsageSummary | null> {
		try {
			return await fetchOpenAICodexUsageSummary(
				{
					isUsingOAuth: () => true,
					getApiKeyAndHeaders: async () => {
						const apiKey = await this.session.modelRegistry.authStorage.getApiKey("openai-codex", {
							includeFallback: false,
							accountName,
						});
						return apiKey ? { ok: true, apiKey } : { ok: false, error: "No OAuth token for account" };
					},
				},
				model,
			);
		} catch {
			return null;
		}
	}

	private switchProviderAccount(providerId: string, accountName: string): void {
		const authStorage = this.session.modelRegistry.authStorage;
		const accounts = authStorage.getAccountNames(providerId);
		if (!authStorage.switchAccount(providerId, accountName)) {
			this.showError(`No account named "${accountName}" for ${providerId}. Available: ${accounts.join(", ")}`);
			return;
		}

		this.session.modelRegistry.refresh();
		this.footer.invalidate();
		this.updateEditorBorderColor();
		this.showStatus(`Switched ${providerId} to account ${accountName}`);
	}

	private refreshAccountState(): void {
		this.session.modelRegistry.refresh();
		void this.updateAvailableProviderCount();
		this.footer.invalidate();
		this.updateEditorBorderColor();
	}

	private removeProviderAccount(providerId: string, accountName: string): void {
		const authStorage = this.session.modelRegistry.authStorage;
		const accounts = authStorage.getAccountNames(providerId);
		if (!authStorage.removeAccount(providerId, accountName)) {
			this.showError(`No account named "${accountName}" for ${providerId}. Available: ${accounts.join(", ")}`);
			return;
		}

		this.refreshAccountState();
		this.showStatus(`Removed ${providerId} account ${accountName}`);
	}

	private removeAllProviderAccounts(providerId: string): void {
		if (!this.session.modelRegistry.authStorage.has(providerId)) {
			this.showError(`No stored accounts for ${providerId}.`);
			return;
		}

		this.session.modelRegistry.authStorage.remove(providerId);
		this.refreshAccountState();
		this.showStatus(`Removed all stored accounts for ${providerId}`);
	}

	private showAccountSelector(providerId?: string): void {
		const options = this.buildAccountOptions(providerId);
		if (options.length === 0) {
			this.showStatus(
				providerId
					? `No stored accounts for ${providerId}. Use /account add ${providerId} <account> first.`
					: "No stored provider accounts. Use /account add first.",
			);
			return;
		}

		this.showSelector((done) => {
			const selector = new AccountSelectorComponent(
				options,
				(option) => {
					done();
					this.switchProviderAccount(option.providerId, option.accountName);
				},
				() => {
					done();
					this.ui.requestRender();
				},
			);
			void this.attachAccountQuota(options).then((updatedOptions) => {
				selector.updateOptions(updatedOptions);
				this.ui.requestRender();
			});
			return { component: selector, focus: selector };
		});
	}

	async handleAccountCommand(text: string): Promise<void> {
		const parts = text.split(/\s+/);
		const action = parts[1];

		if (action === "add") {
			const providerId = parts[2];
			const accountName = parts[3];
			if (parts.length > 4) {
				this.showStatus("Usage: /account add [provider] [account]");
				return;
			}
			if (!providerId) {
				this.showAccountAddAuthTypeSelector();
				return;
			}
			await this.addProviderAccount(providerId, accountName);
			return;
		}

		if (action === "remove") {
			const providerId = parts[2];
			const accountName = parts[3];
			if (parts.length > 4) {
				this.showStatus("Usage: /account remove [provider] [account]");
				return;
			}
			if (!providerId) {
				this.showAccountRemoveProviderSelector();
				return;
			}
			if (!accountName) {
				this.removeAllProviderAccounts(providerId);
				return;
			}
			this.removeProviderAccount(providerId, accountName);
			return;
		}

		const providerId = parts[1];
		const accountName = parts[2];
		if (parts.length > 3) {
			this.showStatus("Usage: /account [provider] [account]");
			return;
		}

		if (!providerId || !accountName) {
			this.showAccountSelector(providerId);
			return;
		}

		this.switchProviderAccount(providerId, accountName);
	}

	private getAccountProviderOptions(authType?: "oauth" | "api_key"): AuthSelectorProvider[] {
		const authStorage = this.session.modelRegistry.authStorage;
		const oauthProviders = authStorage.getOAuthProviders();
		const oauthProviderIds = new Set(oauthProviders.map((provider) => provider.id));
		const options: AuthSelectorProvider[] = oauthProviders.map((provider) => ({
			id: provider.id,
			name: provider.name,
			authType: "oauth",
		}));

		const modelProviders = new Set(this.session.modelRegistry.getAll().map((model) => model.provider));
		for (const providerId of modelProviders) {
			if (!isApiKeyAccountProvider(providerId, oauthProviderIds)) {
				continue;
			}
			options.push({
				id: providerId,
				name: this.session.modelRegistry.getProviderDisplayName(providerId),
				authType: "api_key",
			});
		}

		const filteredOptions = authType ? options.filter((option) => option.authType === authType) : options;
		return filteredOptions.sort((a, b) => a.name.localeCompare(b.name));
	}

	private getStoredAccountProviderOptions(): AuthSelectorProvider[] {
		const authStorage = this.session.modelRegistry.authStorage;
		const options: AuthSelectorProvider[] = [];

		for (const providerId of authStorage.list()) {
			const credential = authStorage.get(providerId);
			if (!credential) {
				continue;
			}
			options.push({
				id: providerId,
				name: this.session.modelRegistry.getProviderDisplayName(providerId),
				authType: credential.type,
			});
		}

		return options.sort((a, b) => a.name.localeCompare(b.name));
	}

	private showAccountAddAuthTypeSelector(): void {
		const subscriptionLabel = "Use a subscription";
		const apiKeyLabel = "Use an API key";
		this.showSelector((done) => {
			const selector = new ExtensionSelectorComponent(
				"Select account type to add:",
				[subscriptionLabel, apiKeyLabel],
				(option) => {
					done();
					const authType = option === subscriptionLabel ? "oauth" : "api_key";
					this.showAccountAddProviderSelector(authType);
				},
				() => {
					done();
					this.ui.requestRender();
				},
			);
			return { component: selector, focus: selector };
		});
	}

	private showAccountAddProviderSelector(authType: "oauth" | "api_key"): void {
		const providerOptions = this.getAccountProviderOptions(authType);
		if (providerOptions.length === 0) {
			this.showStatus(
				authType === "oauth" ? "No subscription providers available." : "No API key providers available.",
			);
			return;
		}

		this.showSelector((done) => {
			const selector = new OAuthSelectorComponent(
				"add",
				this.session.modelRegistry.authStorage,
				providerOptions,
				async (providerId: string) => {
					done();

					const providerOption = providerOptions.find((provider) => provider.id === providerId);
					if (!providerOption) {
						return;
					}

					if (providerOption.authType === "oauth") {
						await this.showLoginDialog(providerOption.id, providerOption.name);
					} else {
						await this.showApiKeyLoginDialog(providerOption.id, providerOption.name);
					}
				},
				() => {
					done();
					this.showAccountAddAuthTypeSelector();
				},
				(providerId) => this.session.modelRegistry.getProviderAuthStatus(providerId),
			);
			return { component: selector, focus: selector };
		});
	}

	private showAccountRemoveProviderSelector(): void {
		const providerOptions = this.getStoredAccountProviderOptions();
		if (providerOptions.length === 0) {
			this.showStatus(
				"No stored credentials to remove. /account remove only removes credentials saved in auth.json; environment variables and settings.json config are unchanged.",
			);
			return;
		}

		const providerLabels = providerOptions.map((provider) => `${provider.name} (${provider.id})`);
		this.showSelector((done) => {
			const selector = new ExtensionSelectorComponent(
				"Select provider to remove stored accounts:",
				providerLabels,
				(option) => {
					done();
					const providerOption = providerOptions[providerLabels.indexOf(option)];
					if (providerOption) {
						this.removeAllProviderAccounts(providerOption.id);
					}
				},
				() => {
					done();
					this.ui.requestRender();
				},
			);
			return { component: selector, focus: selector };
		});
	}

	private async completeProviderAuthentication(
		providerId: string,
		providerName: string,
		authType: "oauth" | "api_key",
		previousModel: Model<any> | undefined,
		accountName?: string,
	): Promise<void> {
		this.session.modelRegistry.refresh();

		const accountSuffix = accountName ? ` account ${accountName}` : "";
		const actionLabel =
			authType === "oauth"
				? `Added account for ${providerName}${accountSuffix}`
				: `Saved API key for ${providerName}${accountSuffix}`;

		let selectedModel: Model<any> | undefined;
		let selectionError: string | undefined;
		if (isUnknownModel(previousModel)) {
			const availableModels = this.session.modelRegistry.getAvailable();
			const providerModels = availableModels.filter((model) => model.provider === providerId);
			if (!hasDefaultModelProvider(providerId)) {
				selectionError = `${actionLabel}, but no default model is configured for provider "${providerId}". Use /settings → Model & thinking → Roles → Main to select a model.`;
			} else if (providerModels.length === 0) {
				selectionError = `${actionLabel}, but no models are available for that provider. Use /settings → Model & thinking → Roles → Main to select a model.`;
			} else {
				const defaultModelId = defaultModelPerProvider[providerId];
				selectedModel = providerModels.find((model) => model.id === defaultModelId);
				if (!selectedModel) {
					selectionError = `${actionLabel}, but its default model "${defaultModelId}" is not available. Use /settings → Model & thinking → Roles → Main to select a model.`;
				} else {
					try {
						await this.session.setModel(selectedModel);
					} catch (error: unknown) {
						selectedModel = undefined;
						const errorMessage = error instanceof Error ? error.message : String(error);
						selectionError = `${actionLabel}, but selecting its default model failed: ${errorMessage}. Use /settings → Model & thinking → Roles → Main to select a model.`;
					}
				}
			}
		}

		await this.updateAvailableProviderCount();
		this.footer.invalidate();
		this.updateEditorBorderColor();
		void this.refreshCodexUsageSummary(true);
		if (selectedModel) {
			this.showStatus(`${actionLabel}. Selected ${selectedModel.id}. Credentials saved to ${getAuthPath()}`);
		} else {
			this.showStatus(`${actionLabel}. Credentials saved to ${getAuthPath()}`);
			if (selectionError) {
				this.showError(selectionError);
			}
		}
	}

	private async showApiKeyLoginDialog(providerId: string, providerName: string, accountName?: string): Promise<void> {
		const previousModel = this.session.model;

		const dialog = new LoginDialogComponent(
			this.ui,
			providerId,
			(_success, _message) => {
				// Completion handled below
			},
			providerName,
		);

		this.editorContainer.clear();
		this.editorContainer.addChild(dialog);
		this.ui.setFocus(dialog);
		this.ui.requestRender();

		const restoreEditor = () => {
			this.editorContainer.clear();
			this.editorContainer.addChild(this.editor);
			this.ui.setFocus(this.editor);
			this.ui.requestRender();
		};

		try {
			const apiKey = (await dialog.showPrompt("Enter API key:")).trim();
			if (!apiKey) {
				throw new Error("API key cannot be empty.");
			}

			this.session.modelRegistry.authStorage.set(providerId, { type: "api_key", key: apiKey }, accountName);

			restoreEditor();
			await this.completeProviderAuthentication(providerId, providerName, "api_key", previousModel, accountName);
		} catch (error: unknown) {
			restoreEditor();
			const errorMsg = error instanceof Error ? error.message : String(error);
			if (errorMsg !== "Login cancelled") {
				this.showError(`Failed to save API key for ${providerName}: ${errorMsg}`);
			}
		}
	}

	private showOAuthLoginSelect(dialog: LoginDialogComponent, prompt: OAuthSelectPrompt): Promise<string | undefined> {
		return new Promise((resolve) => {
			const restoreDialog = () => {
				this.editorContainer.clear();
				this.editorContainer.addChild(dialog);
				this.ui.setFocus(dialog);
				this.ui.requestRender();
			};
			const labels = prompt.options.map((option) => option.label);
			const selector = new ExtensionSelectorComponent(
				prompt.message,
				labels,
				(optionLabel) => {
					restoreDialog();
					resolve(prompt.options.find((option) => option.label === optionLabel)?.id);
				},
				() => {
					restoreDialog();
					resolve(undefined);
				},
			);
			this.editorContainer.clear();
			this.editorContainer.addChild(selector);
			this.ui.setFocus(selector);
			this.ui.requestRender();
		});
	}

	private async showLoginDialog(providerId: string, providerName: string, accountName?: string): Promise<void> {
		const providerInfo = this.session.modelRegistry.authStorage
			.getOAuthProviders()
			.find((provider) => provider.id === providerId);
		const previousModel = this.session.model;

		// Providers that use callback servers (can paste redirect URL)
		const usesCallbackServer = providerInfo?.usesCallbackServer ?? false;

		// Create login dialog component
		const dialog = new LoginDialogComponent(
			this.ui,
			providerId,
			(_success, _message) => {
				// Completion handled below
			},
			providerName,
		);

		// Show dialog in editor container
		this.editorContainer.clear();
		this.editorContainer.addChild(dialog);
		this.ui.setFocus(dialog);
		this.ui.requestRender();

		// Promise for manual code input (racing with callback server)
		let manualCodeResolve: ((code: string) => void) | undefined;
		let manualCodeReject: ((err: Error) => void) | undefined;
		const manualCodePromise = new Promise<string>((resolve, reject) => {
			manualCodeResolve = resolve;
			manualCodeReject = reject;
		});

		// Restore editor helper
		const restoreEditor = () => {
			this.editorContainer.clear();
			this.editorContainer.addChild(this.editor);
			this.ui.setFocus(this.editor);
			this.ui.requestRender();
		};

		try {
			await this.session.modelRegistry.authStorage.login(
				providerId as OAuthProviderId,
				{
					onAuth: (info: { url: string; instructions?: string }) => {
						dialog.showAuth(info.url, info.instructions);

						if (usesCallbackServer) {
							// Show input for manual paste, racing with callback
							dialog
								.showManualInput("Paste redirect URL below, or complete login in browser:")
								.then((value) => {
									if (value && manualCodeResolve) {
										manualCodeResolve(value);
										manualCodeResolve = undefined;
									}
								})
								.catch(() => {
									if (manualCodeReject) {
										manualCodeReject(new Error("Login cancelled"));
										manualCodeReject = undefined;
									}
								});
						}
						// For Anthropic: onPrompt is called immediately after
					},

					onDeviceCode: (info) => {
						dialog.showDeviceCode(info);
						dialog.showWaiting("Waiting for authentication...");
					},

					onPrompt: async (prompt: { message: string; placeholder?: string }) => {
						return dialog.showPrompt(prompt.message, prompt.placeholder);
					},

					onProgress: (message: string) => {
						dialog.showProgress(message);
					},

					onSelect: (prompt: OAuthSelectPrompt) => this.showOAuthLoginSelect(dialog, prompt),

					onManualCodeInput: () => manualCodePromise,

					signal: dialog.signal,
				},
				accountName,
			);

			// Success
			restoreEditor();
			await this.completeProviderAuthentication(providerId, providerName, "oauth", previousModel, accountName);
		} catch (error: unknown) {
			restoreEditor();
			const errorMsg = error instanceof Error ? error.message : String(error);
			if (errorMsg !== "Login cancelled") {
				this.showError(`Failed to add account for ${providerName}: ${errorMsg}`);
			}
		}
	}
	private async getModelCandidates(): Promise<Model<any>[]> {
		if (this.session.scopedModels.length > 0) {
			return this.session.scopedModels.map((scoped) => scoped.model);
		}

		this.session.modelRegistry.refresh();
		try {
			return await this.session.modelRegistry.getAvailable();
		} catch {
			return [];
		}
	}

	async updateAvailableProviderCount(): Promise<void> {
		const models = await this.getModelCandidates();
		const uniqueProviders = new Set(models.map((m) => m.provider));
		this.footerDataProvider.setAvailableProviderCount(uniqueProviders.size);
	}

	async refreshCodexUsageSummary(_force: boolean): Promise<void> {
		this.footerDataProvider.setCodexUsageSummary(null);
	}

	resetCodexUsageCache(): void {}
}
