export interface MutationTargets {
	paths: string[];
	unknown: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addPath(targets: MutationTargets, value: unknown): void {
	if (typeof value === "string" && value.trim().length > 0) targets.paths.push(value.trim());
}

function editTargets(input: Record<string, unknown>): MutationTargets {
	const targets: MutationTargets = { paths: [], unknown: false };
	addPath(targets, input.path);
	addPath(targets, input.file);
	if (Array.isArray(input.edits)) {
		for (const edit of input.edits) {
			if (!isRecord(edit)) throw new Error("edit target must be an object");
			addPath(targets, edit.path);
			addPath(targets, edit.rename);
		}
	}
	targets.unknown = targets.paths.length === 0;
	return targets;
}

function writeTargets(input: Record<string, unknown>): MutationTargets {
	const targets: MutationTargets = { paths: [], unknown: false };
	addPath(targets, input.path);
	targets.unknown = targets.paths.length === 0;
	return targets;
}

function bashTargets(input: Record<string, unknown>): MutationTargets {
	if (typeof input.command !== "string" || input.command.trim().length === 0) {
		return { paths: [], unknown: true };
	}
	const paths: string[] = [];
	const pathLike = /(?:^|[\s;&|()])(?:(?:@?\.\.?\/|@?\/|~\/|\.pi(?:\/|\b))[^\s;&|()<>"']*)/gu;
	for (const match of input.command.matchAll(pathLike)) {
		const candidate = match[0].trim().replace(/^@/u, "");
		if (candidate) paths.push(candidate);
	}
	return { paths, unknown: false };
}

export function extractMutationTargets(toolName: string, input: Record<string, unknown>): MutationTargets {
	if (toolName === "edit") return editTargets(input);
	if (toolName === "write") return writeTargets(input);
	if (toolName === "bash") return bashTargets(input);
	throw new Error(`unsupported mutation tool: ${toolName}`);
}

const SHELL_MUTATION_PATTERN =
	/(?:^|[\s;&|()])(?:rm|rmdir|mv|cp|mkdir|touch|ln|chmod|chown|truncate|tee|install|patch|git\s+(?:apply|checkout|clean|mv|rm|reset|restore|stash)|npm\s+(?:install|ci|update|run\s+(?:build|format|lint|check|test))|pnpm\s+(?:install|update)|yarn\s+(?:install|add|remove)|cargo\s+(?:add|update|fmt|fix)|uv\s+(?:add|sync|pip)|python\S*\s+-c|node\s+-e|perl\s+-pi|sed\s+-i)\b|(?:^|[^<])>{1,2}(?!>)/u;

export function isMutatingBashCommand(input: Record<string, unknown>): boolean {
	return typeof input.command === "string" && SHELL_MUTATION_PATTERN.test(input.command);
}
