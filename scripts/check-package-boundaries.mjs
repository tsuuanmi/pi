import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const packageRoots = {
	"@tsuuanmi/pi-ai": "packages/ai",
	"@tsuuanmi/pi-agent": "packages/agent",
	"@tsuuanmi/pi-orchestrator": "packages/orchestrator",
	"@tsuuanmi/pi-tui": "packages/tui",
	"@tsuuanmi/pi-workflows": "packages/workflows",
	"@tsuuanmi/pi": "packages/pi",
};

const aliasOwners = {
	"#agent/": "@tsuuanmi/pi-agent",
	"#orchestrator/": "@tsuuanmi/pi-orchestrator",
	"#workflows/": "@tsuuanmi/pi-workflows",
	"#pi/": "@tsuuanmi/pi",
};

const INTENDED_PACKAGE_DAG = [
	["@tsuuanmi/pi-agent", "@tsuuanmi/pi-ai"],
	["@tsuuanmi/pi-orchestrator", "@tsuuanmi/pi-agent"],
	["@tsuuanmi/pi-orchestrator", "@tsuuanmi/pi-ai"],
	["@tsuuanmi/pi-workflows", "@tsuuanmi/pi-agent"],
	["@tsuuanmi/pi-workflows", "@tsuuanmi/pi-orchestrator"],
	["@tsuuanmi/pi-workflows", "@tsuuanmi/pi-ai"],
	["@tsuuanmi/pi-workflows", "@tsuuanmi/pi-tui"],
	["@tsuuanmi/pi-workflows", "@tsuuanmi/pi"],
	["@tsuuanmi/pi", "@tsuuanmi/pi-agent"],
	["@tsuuanmi/pi", "@tsuuanmi/pi-ai"],
	["@tsuuanmi/pi", "@tsuuanmi/pi-orchestrator"],
	["@tsuuanmi/pi", "@tsuuanmi/pi-tui"],
];

const ALLOWED_SOURCE_IMPORT_GRAPH = {
	"@tsuuanmi/pi-ai": new Set(),
	"@tsuuanmi/pi-agent": new Set(["@tsuuanmi/pi-ai"]),
	"@tsuuanmi/pi-orchestrator": new Set(["@tsuuanmi/pi-agent", "@tsuuanmi/pi-ai"]),
	"@tsuuanmi/pi-tui": new Set(),
	"@tsuuanmi/pi-workflows": new Set([
		"@tsuuanmi/pi",
		"@tsuuanmi/pi-agent",
		"@tsuuanmi/pi-orchestrator",
		"@tsuuanmi/pi-ai",
		"@tsuuanmi/pi-tui",
	]),
	"@tsuuanmi/pi": new Set([
		"@tsuuanmi/pi-ai",
		"@tsuuanmi/pi-agent",
		"@tsuuanmi/pi-orchestrator",
		"@tsuuanmi/pi-tui",
	]),
};

const FORBIDDEN_SOURCE_IMPORT_EDGES = [
	{ from: "@tsuuanmi/pi-workflows", to: ["#pi/*"] },
	{ from: "packages/pi/src/subagents/**", to: ["@tsuuanmi/pi-workflows", "@tsuuanmi/pi-workflows/*", "#workflows/*"] },
	{ from: "@tsuuanmi/pi-agent", to: ["@tsuuanmi/pi-workflows", "@tsuuanmi/pi-workflows/*", "#workflows/*", "@tsuuanmi/pi", "@tsuuanmi/pi/*", "#pi/*"] },
];

const allowedImports = ALLOWED_SOURCE_IMPORT_GRAPH;
const ignoredDirectories = new Set(["dist", "node_modules"]);
const internalRules = [
	{ directory: "packages/pi/src/api", forbidden: ["#pi/runtime/", "#pi/ui/"] },
	{
		directory: "packages/pi/src/package",
		forbidden: ["#pi/cli/", "#pi/modes/", "#pi/ui/"],
	},
	{
		directory: "packages/pi/src/subagents",
		forbidden: ["#pi/cli/", "@tsuuanmi/pi-workflows", "#workflows/"],
	},
	{ directory: "packages/pi/src/package/loader.ts", forbidden: ["#pi/index"] },
	{
		directory: "packages/workflows/src/skills/ultragoal",
		forbidden: ["@tsuuanmi/pi-orchestrator", "#orchestrator/"],
	},
];
const workflowManagerCallers = new Set([
	"packages/workflows/src/tool/context.ts",
	"packages/workflows/src/skills/team/agent-adapter.ts",
	"packages/workflows/src/skills/ralplan/agent-adapter.ts",
	"packages/workflows/src/skills/ultragoal/tools.ts",
]);
const workflowManagerCallPattern = /\.(spawn|resume|steer|pause|cancel|read|list|waitFor|inspect|attach|kill|dispose)\s*\(/g;
const workflowManagerReferencePattern = /\bSubagentManager(?:Api)?\b/;
const teamExecutionPath = "packages/workflows/src/skills/team/execution.ts";
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const failures = [];
const manifests = new Map();
const buildConfigs = new Map();

for (const [owner, root] of Object.entries(packageRoots)) {
	manifests.set(owner, readJsonFile(join(root, "package.json"), owner));
	buildConfigs.set(owner, readJsonFileIfPresent(join(root, "tsconfig.build.json")));
}

checkAllowedGraph();

for (const [owner, root] of Object.entries(packageRoots)) {
	const src = join(root, "src");
	if (!exists(src)) continue;
	for (const file of collectTsFiles(src)) {
		checkFile(owner, file);
		if (owner === "@tsuuanmi/pi-workflows") checkWorkflowExecution(file);
	}
}
for (const rule of internalRules) {
	const files = rule.directory.endsWith(".ts") ? [rule.directory] : collectTsFiles(rule.directory);
	for (const file of files) checkInternalFile(rule, file);
}

if (failures.length > 0) {
	console.error("Forbidden package boundary imports:");
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}

function checkFile(owner, file) {
	const text = readFileSync(file, "utf8");
	checkForbiddenSourceEdges(owner, file, text);
	for (const specifier of importSpecifiers(text)) {
		const target = targetPackage(specifier);
		if (!target || target === owner) continue;
		if (!allowedImports[owner]?.has(target)) {
			failures.push(`${relative(process.cwd(), file)}: ${specifier} is not allowed in ${owner}`);
			continue;
		}
		checkPackageImport(owner, file, specifier, target);
	}
}

function checkPackageImport(owner, file, specifier, target) {
	const manifest = manifests.get(owner) ?? {};
	const dependencies = new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {}),
	]);
	if (!dependencies.has(target)) {
		failures.push(`${relative(process.cwd(), file)}: ${specifier} requires a direct dependency on ${target}`);
	}

	const config = buildConfigs.get(owner);
	if (!hasPathAlias(config, specifier)) {
		failures.push(`${relative(process.cwd(), file)}: ${specifier} has no matching tsconfig.build.json path in ${owner}`);
	} else if (!pathAliasTargetsPackage(owner, config, specifier, target)) {
		failures.push(`${relative(process.cwd(), file)}: ${specifier} resolves outside ${target} in ${owner}'s tsconfig.build.json`);
	}

	if (!isPublishedImport(target, specifier)) {
		failures.push(`${relative(process.cwd(), file)}: ${specifier} is not a published export of ${target}`);
	}
}

function checkInternalFile(rule, file) {
	const text = readFileSync(file, "utf8");
	const relativeFile = relative(process.cwd(), file).replaceAll("\\\\", "/");
	const exceptions = rule.exceptions?.[relativeFile] ?? [];
	for (const specifier of importSpecifiers(text)) {
		if (exceptions.some((prefix) => specifier.startsWith(prefix))) continue;
		if (rule.forbidden.some((prefix) => specifier.startsWith(prefix))) {
			failures.push(`${relativeFile}: ${specifier} violates its internal boundary`);
		}
	}
}

function checkWorkflowExecution(file) {
	const path = relative(process.cwd(), file).replaceAll("\\\\", "/");
	const text = readFileSync(file, "utf8");
	if (path !== teamExecutionPath && !workflowManagerReferencePattern.test(text)) return;
	const managerCalls = [...text.matchAll(workflowManagerCallPattern)].map((match) => match[1]);
	if (managerCalls.length > 0 && !workflowManagerCallers.has(path)) {
		failures.push(`${path}: direct SubagentManager calls are not allowed here; use Orchestrator`);
	}

	if (path !== teamExecutionPath) return;
	if (!text.includes("runTeamOrchestrator")) {
		failures.push(`${path}: Team execution must use runTeamOrchestrator`);
	}
	if (managerCalls.length > 0) {
		failures.push(`${path}: Team execution must not call SubagentManager directly`);
	}
}

function checkForbiddenSourceEdges(owner, file, text) {
	const relativeFile = relative(process.cwd(), file).replaceAll("\\\\", "/");
	for (const rule of FORBIDDEN_SOURCE_IMPORT_EDGES) {
		const fromMatches = rule.from.startsWith("packages/")
			? (rule.from.endsWith("/**") ? relativeFile.startsWith(rule.from.slice(0, -3)) : relativeFile === rule.from)
			: owner === rule.from;
		if (!fromMatches) continue;
		for (const specifier of importSpecifiers(text)) {
			if (rule.to.some((pattern) => pattern.endsWith("/*") ? specifier.startsWith(pattern.slice(0, -1)) : specifier === pattern)) {
				failures.push(`${relativeFile}: ${specifier} is forbidden by package ownership rules`);
			}
		}
	}
}

function checkAllowedGraph() {
	checkDAGCycles(INTENDED_PACKAGE_DAG);
	const intendedEdges = new Set(INTENDED_PACKAGE_DAG.map(([from, to]) => `${from}->${to}`));
	const allowedEdges = new Set(
		Object.entries(allowedImports).flatMap(([from, targets]) => [...targets].map((to) => `${from}->${to}`)),
	);
	for (const edge of intendedEdges) {
		if (!allowedEdges.has(edge)) failures.push(`intended package graph allows undeclared edge: ${edge}`);
	}
	for (const edge of allowedEdges) {
		if (!intendedEdges.has(edge)) failures.push(`allowed package graph is missing intended edge: ${edge}`);
	}
	const visiting = new Set();
	const visited = new Set();
	const stack = [];

	function visit(owner) {
		if (visited.has(owner)) return;
		if (visiting.has(owner)) {
			const cycleStart = stack.indexOf(owner);
			const cycle = [...stack.slice(cycleStart), owner].join(" -> ");
			failures.push(`allowed package graph contains a cycle: ${cycle}`);
			return;
		}

		visiting.add(owner);
		stack.push(owner);
		for (const target of allowedImports[owner] ?? []) visit(target);
		stack.pop();
		visiting.delete(owner);
		visited.add(owner);
	}

	for (const owner of Object.keys(packageRoots)) visit(owner);
}

function checkDAGCycles(edges) {
	const graph = new Map();
	for (const [from, to] of edges) graph.set(from, [...(graph.get(from) ?? []), to]);
	const visiting = new Set();
	const visited = new Set();
	function visit(node) {
		if (visiting.has(node)) {
			failures.push(`intended package DAG contains a cycle at ${node}`);
			return;
		}
		if (visited.has(node)) return;
		visiting.add(node);
		for (const next of graph.get(node) ?? []) visit(next);
		visiting.delete(node);
		visited.add(node);
	}
	for (const node of graph.keys()) visit(node);
}

function hasPathAlias(config, specifier) {
	const paths = config?.compilerOptions?.paths;
	if (!paths || typeof paths !== "object") return false;
	return Object.keys(paths).some((pattern) => matchesPathPattern(pattern, specifier));
}

function pathAliasTargetsPackage(owner, config, specifier, target) {
	const paths = config?.compilerOptions?.paths;
	if (!paths || typeof paths !== "object") return false;
	const pattern = Object.keys(paths).find((candidate) => matchesPathPattern(candidate, specifier));
	if (!pattern) return false;

	const configuredPaths = paths[pattern];
	if (!Array.isArray(configuredPaths)) return false;
	const targetRoot = resolve(packageRoots[target]);
	return configuredPaths.some((configuredPath) => {
		if (typeof configuredPath !== "string") return false;
		const placeholder = configuredPath.replaceAll("*", "__pi_boundary__");
		const resolvedPath = resolve(packageRoots[owner], placeholder);
		return resolvedPath.startsWith(`${targetRoot}/dist/`);
	});
}

function matchesPathPattern(pattern, specifier) {
	if (pattern === specifier) return true;
	return pattern.endsWith("/*") && specifier.startsWith(pattern.slice(0, -1));
}

function isPublishedImport(target, specifier) {
	const manifest = manifests.get(target) ?? {};
	const suffix = specifier.slice(target.length);
	const subpath = suffix ? `.${suffix}` : ".";
	const exportsField = manifest.exports;
	if (exportsField === undefined || typeof exportsField === "string") return subpath === ".";
	if (!exportsField || typeof exportsField !== "object") return false;

	const exportKeys = Object.keys(exportsField);
	if (!exportKeys.some((key) => key.startsWith("."))) return subpath === ".";
	return exportKeys.some((key) => {
		if (key === subpath) return true;
		return key.endsWith("/*") && subpath.startsWith(key.slice(0, -1));
	});
}

function readJsonFile(path, label) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		failures.push(`${label}: unable to read ${relative(process.cwd(), path)}`);
		return {};
	}
}

function readJsonFileIfPresent(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

function targetPackage(specifier) {
	for (const [alias, owner] of Object.entries(aliasOwners)) {
		if (specifier.startsWith(alias)) return owner;
	}
	for (const name of Object.keys(packageRoots)) {
		if (specifier === name || specifier.startsWith(`${name}/`)) return name;
	}
	return undefined;
}

function importSpecifiers(text) {
	const specifiers = [];
	for (const match of text.matchAll(importPattern)) specifiers.push(match[1] ?? match[2]);
	return specifiers;
}

function collectTsFiles(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!ignoredDirectories.has(entry.name)) files.push(...collectTsFiles(join(directory, entry.name)));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) files.push(join(directory, entry.name));
	}
	return files;
}

function exists(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
