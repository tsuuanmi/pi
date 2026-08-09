import { SUBAGENT_SPECS, type SubagentDetails, type SubagentSpec } from "@tsuuanmi/pi-agent";
import type { TSchema } from "typebox";
import { adaptSubagentSpec } from "#workflows/tool/adapter";
import type { WorkflowToolHost } from "#workflows/tool/host";

export function registerSubagentTools(host: WorkflowToolHost): void {
	registerSubagentTool(host, SUBAGENT_SPECS[0]);
	registerSubagentTool(host, SUBAGENT_SPECS[1]);
	registerSubagentTool(host, SUBAGENT_SPECS[2]);
	registerSubagentTool(host, SUBAGENT_SPECS[3]);
	registerSubagentTool(host, SUBAGENT_SPECS[4]);
	registerSubagentTool(host, SUBAGENT_SPECS[5]);
	registerSubagentTool(host, SUBAGENT_SPECS[6]);
}

function registerSubagentTool<TParameters extends TSchema, TDetails extends SubagentDetails>(
	host: WorkflowToolHost,
	spec: SubagentSpec<TParameters, TDetails>,
): void {
	host.registerTool(adaptSubagentSpec(spec));
}
