import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@tsuuanmi/pi-agent";
import { getModel } from "@tsuuanmi/pi-ai";
import { AuthStorage } from "#pi/auth/storage";
import { createCodingTools } from "#pi/index";
import { ModelRegistry } from "#pi/loader/model-registry";
import { AgentSession } from "#pi/runtime/agent-session";
import { SessionManager } from "#pi/session/manager";
import { SettingsManager } from "#pi/settings/manager";
import { API_KEY } from "./messages.ts";
import { createTestResourceLoader } from "./resource-loader.ts";

export interface TestSessionOptions {
	inMemory?: boolean;
	systemPrompt?: string;
	settingsOverrides?: Record<string, unknown>;
}

export interface TestSessionContext {
	session: AgentSession;
	sessionManager: SessionManager;
	tempDir: string;
	cleanup: () => void;
}

export function createTestSession(options: TestSessionOptions = {}): TestSessionContext {
	const tempDir = join(tmpdir(), `pi-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });

	const model = getModel("anthropic", "claude-sonnet-4-5")!;
	const agent = new Agent({
		getApiKey: () => API_KEY,
		initialState: {
			model,
			systemPrompt: options.systemPrompt ?? "You are a helpful assistant. Be extremely concise.",
			tools: createCodingTools(process.cwd()),
		},
	});

	const sessionManager = options.inMemory ? SessionManager.inMemory() : SessionManager.create(tempDir);
	const settingsManager = SettingsManager.create(tempDir, tempDir);

	if (options.settingsOverrides) {
		settingsManager.applyOverrides(options.settingsOverrides);
	}

	const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
	const modelRegistry = ModelRegistry.create(authStorage, settingsManager);
	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd: tempDir,
		modelRegistry,
		resourceLoader: createTestResourceLoader(),
	});

	session.subscribe(() => {});

	return {
		session,
		sessionManager,
		tempDir,
		cleanup: () => {
			session.dispose();
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true });
			}
		},
	};
}
