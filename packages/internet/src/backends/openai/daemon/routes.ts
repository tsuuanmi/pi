export const DAEMON_ROUTES = {
	health: "/healthz",
	compact: "/v1/responses/compact",
	control: {
		drain: "/admin/drain",
		resume: "/admin/resume",
		shutdown: "/admin/shutdown",
		"cancel-browser-turns": "/admin/cancel-browser-turns",
	},
} as const;

export interface DaemonHealth {
	status: "ok";
	config_fingerprint: string;
	accepting_turns: boolean;
	active_http_turns: number;
	active_browser_turns: number;
}

export interface CompactRequest {
	model: string;
	input: unknown[];
	instructions?: string;
}

export interface CompactResponse {
	output: unknown[];
}
