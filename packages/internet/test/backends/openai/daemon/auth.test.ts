import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { controlHeaders, daemonBaseUrl, readDaemonConfig } from "#internet/backends/openai/daemon/auth";

const controlToken = "a".repeat(40);

async function configDir(mode = 0o600): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "pi-internet-auth-"));
	const path = join(directory, "config.json");
	await writeFile(path, JSON.stringify({ host: "127.0.0.1", port: 17841, controlToken }), { mode });
	await chmod(path, mode);
	return directory;
}

describe("daemon auth", () => {
	it("reads secure config and builds endpoints", async () => {
		const config = await readDaemonConfig(await configDir());
		expect(daemonBaseUrl(config, true)).toBe("http://127.0.0.1:17841/v1");
		expect(controlHeaders(config.controlToken)).toEqual({ authorization: `Bearer ${controlToken}` });
	});

	it("rejects group-readable configuration", async () => {
		await expect(readDaemonConfig(await configDir(0o640))).rejects.toThrow("must not be group/world accessible");
	});
});
