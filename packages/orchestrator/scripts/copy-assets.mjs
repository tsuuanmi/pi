import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const subagent = join(root, "dist", "subagent");
await mkdir(subagent, { recursive: true });
await cp(join(root, "src", "subagent", "run-identity.schema.json"), join(subagent, "run-identity.schema.json"));
