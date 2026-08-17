import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GeminiWebInternetAccount } from "#internet/core/types";
import { daemonLoginMarkerPath, ensureOwnedDaemonConfig } from "#internet/daemon/config";
import {
	createGeminiWebProviderConfig,
	geminiWebProviderName,
	registerGeminiWebProviders,
} from "#internet/providers/gemini-web/provider";

async function account(): Promise<GeminiWebInternetAccount> {
	const configDir = await mkdtemp(join(tmpdir(), "pi-internet-gemini-provider-"));
	const target: GeminiWebInternetAccount = {
		id: "research",
		provider: "gemini-web",
		displayName: "Gemini Research",
		configDir,
		host: "127.0.0.1",
		port: 18043,
		enabled: true,
	};
	await ensureOwnedDaemonConfig(target, { releaseVersion: "0.1.0", runtimeCommand: ["/runtime/bin/daemon"] });
	await mkdir(join(configDir, "browser"), { recursive: true });
	await writeFile(join(configDir, "browser", "storage-state.json"), "{}\n");
	await writeFile(
		daemonLoginMarkerPath(target),
		JSON.stringify({
			version: 1,
			provider: "gemini-web",
			authenticatedAt: new Date().toISOString(),
			signOutHref: "https://accounts.google.com/SignOutOptions",
			capabilities: {
				version: 1,
				provider: "gemini-web",
				labels: { flash: "3.7 Flash", thinking: "Extended thinking", pro: "3.1 Pro" },
				available: ["flash", "thinking", "pro"],
			},
		}),
	);
	return target;
}

describe("Gemini Web provider registration", () => {
	it("registers a distinct capability-driven Responses provider", async () => {
		const target = await account();
		const config = await createGeminiWebProviderConfig(target);
		expect(config).toMatchObject({
			api: "openai-responses",
			baseUrl: "http://127.0.0.1:18043/v1",
			authHeader: false,
		});
		expect(config.models?.map((model) => model.id)).toEqual(["flash", "pro"]);
		expect(config.models?.every((model) => model.reasoning)).toBe(true);
		expect(config.models?.map((model) => model.thinkingLevelMap?.high)).toEqual(["high", "high"]);
		expect(geminiWebProviderName({ id: "default" })).toBe("gemini-web");
	});

	it("preserves caller identity without ChatGPT environment metadata", () => {
		const registered: string[] = [];
		return registerGeminiWebProviders({ registerProvider: (name) => registered.push(name) }, []).then(() => {
			expect(registered).toEqual([]);
		});
	});
});
