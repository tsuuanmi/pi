import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const source = join("src", "subagents", "subagent-run-identity.schema.json");
const targetDir = join("dist", "subagents");
const target = join(targetDir, "subagent-run-identity.schema.json");

if (existsSync(source)) {
	mkdirSync(targetDir, { recursive: true });
	cpSync(source, target);
}
