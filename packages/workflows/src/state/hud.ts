import type { StatusLineHudEntry, StatusLineHudEntryReader } from "@tsuuanmi/pi-tui";
import { readWorkflowActiveState } from "#workflows/state/active-state";

export const readWorkflowHudEntries: StatusLineHudEntryReader = async ({
	cwd,
	sessionId,
}): Promise<readonly StatusLineHudEntry[] | undefined> => {
	const state = await readWorkflowActiveState(cwd, { sessionId });
	return state?.active_workflows.map(({ skill, ...entry }) => ({ id: skill, ...entry }));
};
