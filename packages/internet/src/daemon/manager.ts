import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import type { InternetAccount } from "#internet/core/types";
import {
	daemonConfigFingerprint,
	daemonLoginExists,
	ensureOwnedDaemonConfig,
	syncOwnedDaemonCapabilities,
} from "#internet/daemon/config";
import { waitForDaemonHealth } from "#internet/daemon/health";
import type { DaemonRuntime } from "#internet/daemon/runtime";
import { resolveDaemonRuntime } from "#internet/daemon/runtime";

export type DaemonProcessState = "stopped" | "running" | "login-required";

export interface OwnedDaemonStatus {
	account: string;
	state: DaemonProcessState;
	pid?: number;
	loginExists: boolean;
	owned: boolean;
}

export interface OwnedDaemonManagerOptions {
	runtime?: DaemonRuntime;
	resolveRuntime?: () => Promise<DaemonRuntime>;
	spawn?: typeof spawn;
	waitForHealth?: typeof waitForDaemonHealth;
}

export class OwnedDaemonManager {
	private readonly accounts: Map<string, InternetAccount>;
	private readonly resolveRuntime: () => Promise<DaemonRuntime>;
	private readonly spawnProcess: typeof spawn;
	private readonly waitForHealth: typeof waitForDaemonHealth;
	private readonly processes = new Map<string, ChildProcess>();
	private readonly managedAccounts = new Set<string>();
	private readonly operations = new Map<string, Promise<void>>();

	constructor(accounts: InternetAccount[], options: OwnedDaemonManagerOptions = {}) {
		this.accounts = new Map(accounts.map((account) => [account.id, account]));
		this.resolveRuntime = options.runtime
			? async () => options.runtime!
			: (options.resolveRuntime ?? resolveDaemonRuntime);
		this.spawnProcess = options.spawn ?? spawn;
		this.waitForHealth = options.waitForHealth ?? waitForDaemonHealth;
	}

	async autoStart(): Promise<void> {
		await Promise.all(
			[...this.accounts.values()]
				.filter((account) => account.enabled)
				.map(async (account) => {
					if (await daemonLoginExists(account)) await this.start(account.id);
				}),
		);
	}

	ensureReady(accountId: string): Promise<void> {
		const account = this.account(accountId);
		return this.enqueue(account.id, async () => {
			if (!(await daemonLoginExists(account))) await this.loginAccount(account);
			await this.startAccount(account);
		});
	}

	login(accountId: string): Promise<void> {
		const account = this.account(accountId);
		return this.enqueue(account.id, () => this.loginAccount(account));
	}

	start(accountId: string): Promise<void> {
		const account = this.account(accountId);
		return this.enqueue(account.id, () => this.startAccount(account));
	}

	stop(accountId?: string): Promise<void> {
		const accounts = accountId ? [this.account(accountId)] : [...this.accounts.values()];
		return Promise.all(accounts.map((account) => this.enqueue(account.id, () => this.stopAccount(account)))).then(
			() => {},
		);
	}

	restart(accountId: string): Promise<void> {
		const account = this.account(accountId);
		return this.enqueue(account.id, async () => {
			await this.stopAccount(account);
			await this.startAccount(account);
		});
	}

	async status(accountId?: string): Promise<OwnedDaemonStatus[]> {
		const accounts = accountId ? [this.account(accountId)] : [...this.accounts.values()];
		return Promise.all(
			accounts.map(async (account) => {
				const process = this.processes.get(account.id);
				const owned = this.managedAccounts.has(account.id);
				const loginExists = await daemonLoginExists(account);
				let healthy = Boolean(process && process.exitCode === null && !process.killed);
				if (!healthy) {
					try {
						await (await DaemonClient.forAccount(account)).health();
						healthy = true;
					} catch {}
				}
				return {
					account: account.id,
					state: healthy ? "running" : loginExists ? "stopped" : "login-required",
					pid: process?.pid,
					loginExists,
					owned,
				};
			}),
		);
	}

	private async waitForOffline(client: Pick<DaemonClient, "health">): Promise<void> {
		for (let attempt = 0; attempt < 50; attempt += 1) {
			try {
				await client.health();
			} catch {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		throw new Error("The stale ChatGPT Web daemon did not stop before restart.");
	}

	private account(id: string): InternetAccount {
		const account = this.accounts.get(id);
		if (!account) throw new Error(`Internet account not found: ${id}`);
		return account;
	}

	private enqueue(accountId: string, operation: () => Promise<void>): Promise<void> {
		const previous = this.operations.get(accountId) ?? Promise.resolve();
		const next = previous.catch(() => {}).then(operation);
		this.operations.set(accountId, next);
		const cleanup = () => {
			if (this.operations.get(accountId) === next) this.operations.delete(accountId);
		};
		void next.then(cleanup, cleanup);
		return next;
	}

	private async loginAccount(account: InternetAccount): Promise<void> {
		await this.stopAccount(account);
		const runtime = await this.resolveRuntime();
		await ensureOwnedDaemonConfig(account, {
			releaseVersion: runtime.manifest.appVersion,
			runtimeCommand: [runtime.launcher],
		});
		const child = this.spawnProcess(runtime.launcher, ["--home", account.configDir, "login"], {
			stdio: "inherit",
			env: { ...process.env, CODEX_CHATGPT_WEB_HOME: account.configDir },
		});
		await new Promise<void>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) => {
				if (code === 0) resolve();
				else
					reject(
						new Error(
							`ChatGPT Web login exited with ${signal ? `signal ${signal}` : `status ${code ?? "unknown"}`}.`,
						),
					);
			});
		});
		if (!(await daemonLoginExists(account)))
			throw new Error("ChatGPT Web login completed without verified authentication state.");
		await syncOwnedDaemonCapabilities(account);
	}

	private async startAccount(account: InternetAccount): Promise<void> {
		const running = this.processes.get(account.id);
		if (running && running.exitCode === null && !running.killed) return;
		const runtime = await this.resolveRuntime();
		const config = await ensureOwnedDaemonConfig(account, {
			releaseVersion: runtime.manifest.appVersion,
			runtimeCommand: [runtime.launcher],
		});
		const client = await DaemonClient.forAccount(account);
		let health: Awaited<ReturnType<DaemonClient["health"]>> | undefined;
		try {
			health = await client.health();
		} catch {}
		if (health) {
			if (health.config_fingerprint === daemonConfigFingerprint(config)) return;
			await client.control("shutdown");
			await this.waitForOffline(client);
		}

		await ensureOwnedDaemonConfig(account, {
			releaseVersion: runtime.manifest.appVersion,
			runtimeCommand: [runtime.launcher],
		});
		const child = this.spawnProcess(runtime.launcher, ["--home", account.configDir, "serve"], {
			stdio: ["ignore", "ignore", "inherit"],
			env: { ...process.env, CODEX_CHATGPT_WEB_HOME: account.configDir },
		});
		this.processes.set(account.id, child);
		this.managedAccounts.add(account.id);
		child.unref();
		child.once("exit", () => {
			if (this.processes.get(account.id) === child) this.processes.delete(account.id);
			this.managedAccounts.delete(account.id);
		});
		try {
			await this.waitForHealth(await DaemonClient.forAccount(account));
			const config = await ensureOwnedDaemonConfig(account, {
				releaseVersion: runtime.manifest.appVersion,
				runtimeCommand: [runtime.launcher],
			});
			if (config.mode === "full") await this.runTunnelAction(runtime, account, "connect");
		} catch (error) {
			child.kill("SIGTERM");
			this.processes.delete(account.id);
			throw error;
		}
	}

	private async runTunnelAction(
		runtime: DaemonRuntime,
		account: InternetAccount,
		action: "connect" | "disconnect",
	): Promise<void> {
		const child = this.spawnProcess(runtime.launcher, ["--home", account.configDir, "tunnel", action], {
			stdio: ["ignore", "ignore", "inherit"],
			env: { ...process.env, CODEX_CHATGPT_WEB_HOME: account.configDir },
		});
		await new Promise<void>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) => {
				if (code === 0) resolve();
				else
					reject(
						new Error(
							`ChatGPT Web tunnel ${action} exited with ${signal ? `signal ${signal}` : `status ${code ?? "unknown"}`}.`,
						),
					);
			});
		});
	}

	private async stopAccount(account: InternetAccount): Promise<void> {
		const child = this.processes.get(account.id);
		const exited = child
			? new Promise<void>((resolve) => {
					if (child.exitCode !== null || child.killed) resolve();
					else child.once("exit", () => resolve());
				})
			: Promise.resolve();
		try {
			await (await DaemonClient.forAccount(account)).control("shutdown");
		} catch {
			child?.kill("SIGTERM");
		}
		if (child && child.exitCode === null && !child.killed) {
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => {
					child.kill("SIGKILL");
					resolve();
				}, 5_000);
				void exited.then(() => {
					clearTimeout(timeout);
					resolve();
				});
			});
		}
		this.processes.delete(account.id);
		this.managedAccounts.delete(account.id);
	}
}
