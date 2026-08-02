import type { TaskQueueEvent } from "@tsuuanmi/pi-orchestrator";
import { mapQueueEvent, type TeamEvent } from "#workflows/skills/team/event-mapper";

export interface TeamEventSinkOptions {
	emit: (event: TeamEvent) => void | Promise<void>;
}

export class TeamEventSink {
	private readonly emit: TeamEventSinkOptions["emit"];

	constructor(options: TeamEventSinkOptions) {
		this.emit = options.emit;
	}

	readonly handle = async (event: TaskQueueEvent): Promise<void> => {
		await this.emit(mapQueueEvent(event));
	};
}

export function createTeamEventSink(options: TeamEventSinkOptions): TeamEventSink {
	return new TeamEventSink(options);
}
