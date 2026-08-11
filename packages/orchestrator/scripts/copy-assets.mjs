import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const subagents = join(root, "dist", "subagents");
await mkdir(subagents, { recursive: true });
await cp(join(root, "src", "subagents", "run-identity.schema.json"), join(subagents, "run-identity.schema.json"));
