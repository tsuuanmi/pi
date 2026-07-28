/** Policy that constrains which tool names are allowed or excluded. */
export interface ToolAccessPolicy {
	allowedToolNames?: Iterable<string>;
	excludedToolNames?: Iterable<string>;
}

/**
 * Selection policy for resolving a session's active tools.
 *
 * `activeToolNames` is the caller's requested selection. The helper keeps the
 * result ordered, deduplicated, and limited to known tool names that satisfy
 * the access policy.
 */
export interface ToolSelectionPolicy extends ToolAccessPolicy {
	activeToolNames?: Iterable<string>;
	includeAllRegisteredTools?: boolean;
	includeNewlyRegisteredTools?: boolean;
}

function toNameSet(names: Iterable<string> | undefined): Set<string> | undefined {
	if (!names) return undefined;
	return new Set(names);
}

function dedupeToolNames(toolNames: Iterable<string>): string[] {
	const seen = new Set<string>();
	const nextToolNames: string[] = [];
	for (const toolName of toolNames) {
		if (seen.has(toolName)) continue;
		seen.add(toolName);
		nextToolNames.push(toolName);
	}
	return nextToolNames;
}

/**
 * Filter tool names through the provided access policy while preserving order
 * and removing duplicates.
 */
export function resolveToolNames(toolNames: Iterable<string>, policy?: ToolAccessPolicy): string[] {
	const allowedToolNames = toNameSet(policy?.allowedToolNames);
	const excludedToolNames = toNameSet(policy?.excludedToolNames);
	const nextToolNames: string[] = [];
	const seen = new Set<string>();

	for (const toolName of toolNames) {
		if (seen.has(toolName)) continue;
		if (allowedToolNames && !allowedToolNames.has(toolName)) continue;
		if (excludedToolNames?.has(toolName)) continue;
		seen.add(toolName);
		nextToolNames.push(toolName);
	}

	return nextToolNames;
}

/**
 * Resolve the next active tool list from the current registry and selection policy.
 *
 * - Filters out unknown tool names.
 * - Applies allow/exclude policy constraints.
 * - Preserves caller order.
 * - Deduplicates names.
 */
export function resolveToolSelection(
	availableToolNames: Iterable<string>,
	previousActiveToolNames: Iterable<string> | undefined,
	policy: ToolSelectionPolicy = {},
): string[] {
	const availableNames = resolveToolNames(availableToolNames, policy);
	const availableNameSet = new Set(availableNames);

	let nextToolNames: string[];
	if (policy.activeToolNames !== undefined) {
		nextToolNames = resolveToolNames(policy.activeToolNames, policy);
	} else if (policy.includeAllRegisteredTools) {
		nextToolNames = availableNames.slice();
	} else {
		nextToolNames = resolveToolNames(previousActiveToolNames ?? [], policy);
		if (policy.includeNewlyRegisteredTools) {
			const previousNameSet = new Set(nextToolNames);
			for (const toolName of availableNames) {
				if (!previousNameSet.has(toolName)) {
					nextToolNames.push(toolName);
				}
			}
		}
	}

	return dedupeToolNames(nextToolNames).filter((toolName) => availableNameSet.has(toolName));
}
