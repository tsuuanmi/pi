import type { OpenAICodexUsageSummary } from "@tsuuanmi/pi-ai";
import type { GitStatusSummary } from "@tsuuanmi/pi-tui";
import { RepositoryState } from "#pi/ui/interactive/repository-state";

/** Composes repository snapshots with application-owned footer data. */
export class FooterDataProvider {
	private readonly repositoryState: RepositoryState;
	private extensionStatuses = new Map<string, string>();
	private availableProviderCount = 0;
	private codexUsageSummary: OpenAICodexUsageSummary | null = null;

	constructor(cwd: string) {
		this.repositoryState = new RepositoryState(cwd);
	}

	getGitBranch(): string | null {
		return this.repositoryState.getBranch();
	}

	getGitStatus(): GitStatusSummary | null {
		return this.repositoryState.getStatus();
	}

	getExtensionStatuses(): ReadonlyMap<string, string> {
		return this.extensionStatuses;
	}

	onChange(callback: () => void): () => void {
		return this.repositoryState.onChange(callback);
	}

	setExtensionStatus(key: string, text: string | undefined): void {
		if (text === undefined) {
			this.extensionStatuses.delete(key);
		} else {
			this.extensionStatuses.set(key, text);
		}
	}

	clearExtensionStatuses(): void {
		this.extensionStatuses.clear();
	}

	getAvailableProviderCount(): number {
		return this.availableProviderCount;
	}

	getCodexUsageSummary(): OpenAICodexUsageSummary | null {
		return this.codexUsageSummary;
	}

	setAvailableProviderCount(count: number): void {
		this.availableProviderCount = count;
	}

	setCodexUsageSummary(summary: OpenAICodexUsageSummary | null): void {
		this.codexUsageSummary = summary;
	}

	setCwd(cwd: string): void {
		this.repositoryState.setCwd(cwd);
	}

	dispose(): void {
		this.repositoryState.dispose();
	}
}
