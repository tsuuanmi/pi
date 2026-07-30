import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

const allowedImports = {
	"@tsuuanmi/pi-ai": new Set(),
	"@tsuuanmi/pi-agent": new Set(["@tsuuanmi/pi-ai"]),
	"@tsuuanmi/pi-orchestrator": new Set(["@tsuuanmi/pi-agent", "@tsuuanmi/pi-ai"]),
	"@tsuuanmi/pi-tui": new Set(),
	"@tsuuanmi/pi-workflows": new Set([
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
		"@tsuuanmi/pi-workflows",
	]),
};

const ignoredDirectories = new Set(["dist", "node_modules"]);
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const failures = [];

for (const [owner, root] of Object.entries(packageRoots)) {
	const src = join(root, "src");
	if (!exists(src)) continue;
	for (const file of collectTsFiles(src)) checkFile(owner, file);
}

if (failures.length > 0) {
	console.error("Forbidden package boundary imports:");
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}

function checkFile(owner, file) {
	const text = readFileSync(file, "utf8");
	for (const specifier of importSpecifiers(text)) {
		const target = targetPackage(specifier);
		if (!target || target === owner) continue;
		if (allowedImports[owner]?.has(target)) continue;
		failures.push(`${relative(process.cwd(), file)}: ${specifier} is not allowed in ${owner}`);
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
