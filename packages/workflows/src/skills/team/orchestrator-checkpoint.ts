import type { OrchestratorCheckpoint, OrchestratorCheckpointStore } from "@tsuuanmi/pi-orchestrator";

export interface TeamCheckpointStoreOptions {
	read: () => string | undefined | Promise<string | undefined>;
	write: (value: string) => void | Promise<void>;
}

export class TeamCheckpointStore implements OrchestratorCheckpointStore {
	private readonly read: TeamCheckpointStoreOptions["read"];
	private readonly write: TeamCheckpointStoreOptions["write"];

	constructor(options: TeamCheckpointStoreOptions) {
		this.read = options.read;
		this.write = options.write;
	}

	async load(): Promise<OrchestratorCheckpoint | undefined> {
		const value = await this.read();
		if (value === undefined) return undefined;
		if (value.trim().length === 0) throw new Error("Team orchestrator checkpoint is empty.");
		try {
			return JSON.parse(value) as OrchestratorCheckpoint;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Team orchestrator checkpoint JSON is invalid: ${message}`);
		}
	}

	async save(checkpoint: OrchestratorCheckpoint): Promise<void> {
		await this.write(JSON.stringify(checkpoint));
	}
}

export function createTeamCheckpointStore(options: TeamCheckpointStoreOptions): TeamCheckpointStore {
	return new TeamCheckpointStore(options);
}
