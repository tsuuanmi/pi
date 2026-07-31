export interface ServerConfig {
	command: string;
	args?: string[];
	fileTypes: string[];
	rootMarkers: string[];
	languageId?: string;
	initializationOptions?: Record<string, unknown>;
}

export interface Position {
	line: number;
	character: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export interface Location {
	uri: string;
	range: Range;
}

export interface LocationLink {
	targetUri: string;
	targetRange: Range;
	targetSelectionRange: Range;
}

export interface Diagnostic {
	range: Range;
	severity?: number;
	source?: string;
	code?: string | number;
	message: string;
}

export interface DocumentSymbol {
	name: string;
	kind: number;
	range: Range;
	selectionRange: Range;
	children?: DocumentSymbol[];
}

export interface SymbolInformation {
	name: string;
	kind: number;
	location: Location;
	containerName?: string;
}

export interface Hover {
	contents: unknown;
	range?: Range;
}

export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number;
	method: string;
	params?: unknown;
}

export interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: unknown;
}

export interface JsonRpcResponse {
	jsonrpc: "2.0";
	id?: number;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

export type JsonRpcMessage = JsonRpcResponse | JsonRpcRequest | JsonRpcNotification;
