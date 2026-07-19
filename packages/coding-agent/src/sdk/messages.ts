/**
 * Custom message types and transformers for the coding agent.
 *
 * Re-exported from @tsuuanmi/pi-agent, which provides the canonical
 * implementations. The declaration merge ensures AgentMessage includes
 * these types even when consumed through pi-agent's module.
 */

export {
	BashExecutionMessage,
	BranchSummaryMessage,
	CompactionSummaryMessage,
	CustomMessage,
	convertToLlm,
	createBranchSummaryMessage,
	createCompactionSummaryMessage,
	createCustomMessage,
} from "@tsuuanmi/pi-agent";
