import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDaemonStatusSnapshot } from "#internet/backends/openai/daemon/status";

describe("readDaemonStatusSnapshot", () => {
	it("returns an unavailable snapshot instead of throwing", async () => {
		const home = await mkdtemp(join(tmpdir(), "pi-internet-status-"));
		const configPath = join(home, "config.json");
		await mkdir(home, { recursive: true });
		await writeFile(configPath, JSON.stringify({ host: "127.0.0.1", port: 1, controlToken: "a".repeat(40) }), {
			mode: 0o600,
		});
		await chmod(configPath, 0o600);
		const previous = process.env.CODEX_CHATGPT_WEB_HOME;
		process.env.CODEX_CHATGPT_WEB_HOME = home;
		try {
			await expect(readDaemonStatusSnapshot()).resolves.toMatchObject({ available: false });
		} finally {
			if (previous === undefined) delete process.env.CODEX_CHATGPT_WEB_HOME;
			else process.env.CODEX_CHATGPT_WEB_HOME = previous;
		}
	});
});
