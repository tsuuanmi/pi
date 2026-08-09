export interface ProcessInfo {
	pid?: number;
	command?: string;
	args?: readonly string[];
	cwd?: string;
	exitCode?: number | null;
	signal?: string | null;
}

export interface ProtocolInfo {
	name: string;
	version?: string;
	sessionId?: string;
	stopReason?: string;
}

export interface RuntimeBackend {
	kind: "llm" | "process" | "protocol" | "custom";
	name: string;
	modelId?: string;
	provider?: string;
	process?: ProcessInfo;
	protocol?: ProtocolInfo;
	details?: Record<string, unknown>;
}
