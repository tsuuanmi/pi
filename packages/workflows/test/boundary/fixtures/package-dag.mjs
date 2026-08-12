export const ALLOWED_SOURCE_IMPORT_FIXTURE = {
	"@tsuuanmi/pi-agent": ["@tsuuanmi/pi-ai"],
	"@tsuuanmi/pi-orchestrator": ["@tsuuanmi/pi", "@tsuuanmi/pi-agent", "@tsuuanmi/pi-ai"],
	"@tsuuanmi/pi-workflows": ["@tsuuanmi/pi", "@tsuuanmi/pi-agent", "@tsuuanmi/pi-ai", "@tsuuanmi/pi-orchestrator", "@tsuuanmi/pi-tui"],
	"@tsuuanmi/pi": ["@tsuuanmi/pi-agent", "@tsuuanmi/pi-ai", "@tsuuanmi/pi-tui"],
};

export const FORBIDDEN_SOURCE_IMPORT_EDGES = [
	["@tsuuanmi/pi-workflows", "#pi/*"],
	["packages/orchestrator/src/subagent/**", "@tsuuanmi/pi-workflows"],
	["@tsuuanmi/pi-agent", "@tsuuanmi/pi"],
];
