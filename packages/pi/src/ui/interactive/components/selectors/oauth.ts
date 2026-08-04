import {
	Container,
	DynamicBorder,
	type Focusable,
	type SearchableTableColumn,
	SearchableTableSelector,
	Spacer,
	theme,
} from "@tsuuanmi/pi-tui";
import type { AuthStatus, AuthStorage } from "#pi/auth/storage";

export type AuthSelectorProvider = {
	id: string;
	name: string;
	authType: "oauth" | "api_key";
};

type OAuthSelectorMode = "add" | "remove";

function getProviderKey(provider: AuthSelectorProvider): string {
	return `${provider.authType}:${provider.id}`;
}

function getProviderSearchText(provider: AuthSelectorProvider): string {
	return `${provider.name} ${provider.id} ${provider.authType}`;
}

/**
 * Component that renders an auth provider selector.
 */
export class OAuthSelectorComponent extends Container implements Focusable {
	private selector: SearchableTableSelector<AuthSelectorProvider>;
	private mode: OAuthSelectorMode;
	private authStorage: AuthStorage;
	private getAuthStatus: (providerId: string) => AuthStatus;
	private allProviders: AuthSelectorProvider[];

	constructor(
		mode: OAuthSelectorMode,
		authStorage: AuthStorage,
		providers: AuthSelectorProvider[],
		onSelect: (providerId: string) => void,
		onCancel: () => void,
		getAuthStatus?: (providerId: string) => AuthStatus,
	) {
		super();

		this.mode = mode;
		this.authStorage = authStorage;
		this.getAuthStatus = getAuthStatus ?? ((providerId) => this.authStorage.getAuthStatus(providerId));
		this.allProviders = providers;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.selector = new SearchableTableSelector({
			items: providers,
			columns: this.getColumns(),
			getSearchText: getProviderSearchText,
			getItemKey: getProviderKey,
			onSelect: (provider) => onSelect(provider.id),
			onCancel,
			title: mode === "add" ? "Select provider to add account:" : "Select provider to remove accounts:",
			emptyTitle: "  No matching providers",
			getEmptyLines: () => [theme.fg("muted", `  ${this.getEmptyMessage()}`)],
			maxVisibleItems: 8,
			minTableWidth: 56,
		});
		this.addChild(this.selector);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	get focused(): boolean {
		return this.selector.focused;
	}

	set focused(value: boolean) {
		this.selector.focused = value;
	}

	handleInput(keyData: string): void {
		this.selector.handleInput(keyData);
	}

	private getColumns(): SearchableTableColumn<AuthSelectorProvider>[] {
		return [
			{
				id: "provider",
				label: "Provider",
				widthPercent: 44,
				render: (provider, selected) => theme.fg(selected ? "accent" : "text", provider.name),
			},
			{
				id: "type",
				label: "Type",
				widthPercent: 16,
				render: (provider) => theme.fg("muted", provider.authType === "oauth" ? "OAuth" : "API key"),
			},
			{
				id: "status",
				label: "Status",
				widthPercent: 40,
				render: (provider) => this.formatStatusIndicator(provider).trimStart(),
			},
		];
	}

	private getEmptyMessage(): string {
		if (this.allProviders.length > 0) return "No matching providers";
		return this.mode === "add" ? "No providers available" : "No stored accounts. Use /account add first.";
	}

	private formatStatusIndicator(provider: AuthSelectorProvider): string {
		const credential = this.authStorage.get(provider.id);
		if (credential?.type === provider.authType) return theme.fg("success", " ✓ configured");
		if (credential) {
			const label = credential.type === "oauth" ? "subscription configured" : "API key configured";
			return theme.fg("muted", " • ") + theme.fg("warning", label);
		}
		if (provider.authType !== "api_key") return theme.fg("muted", " • unconfigured");

		const status = this.getAuthStatus(provider.id);
		switch (status.source) {
			case "environment":
				return theme.fg("success", ` ✓ env: ${status.label ?? "API key"}`);
			case "runtime":
				return theme.fg("success", " ✓ runtime API key");
			case "fallback":
				return theme.fg("success", " ✓ custom API key");
			case "settings_json_key":
				return theme.fg("success", " ✓ key in settings.json");
			case "settings_json_command":
				return theme.fg("success", " ✓ command in settings.json");
			default:
				return theme.fg("muted", " • unconfigured");
		}
	}
}
