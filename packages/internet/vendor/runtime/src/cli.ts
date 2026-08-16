#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { existsSync, rmSync } from "node:fs";
import { isAbsolute } from "node:path";
import { stdin, stdout } from "node:process";
import { checkBrowserEngine, importChatGptLogin, loginToChatGpt } from "./adapters/chatgpt-web/browser/login";
import { cancelBrowserTurns } from "./adapters/chatgpt-web/lifecycle/control";
import {
  defaultBrokerEndpoint,
  getConfigDir,
  getConfigPath,
  loadConfig,
  loadConfigForSetup,
  resolveBrokerEndpoint,
  DEFAULT_CONNECTOR_NAME,
} from "./adapters/chatgpt-web/lifecycle/config";
import { formatDoctorReport, runDoctor } from "./adapters/chatgpt-web/lifecycle/doctor";
import { runChatGptMcpServer } from "./adapters/chatgpt-web/tools/mcp-server";
import { runCommand } from "./core/process";
import { startServer } from "./adapters/chatgpt-web/server/routes";
import { assertServiceIdle, getServiceStatus, installService, restartService, startService, stopService, uninstallService } from "./core/service";
import { existingFullSetupCredentials, setup, type SetupOptions } from "./adapters/chatgpt-web/lifecycle/setup";
import { connectTunnel, installRuntimeKeyBytes, managedRuntimeKeyPath, stopTunnel, tunnelStatus, waitForTunnelReady } from "./adapters/chatgpt-web/transport/tunnel";
import { getTunnelServiceStatus, restartTunnelService, startTunnelService, stopTunnelService, uninstallTunnelService } from "./adapters/chatgpt-web/transport/tunnel-service";
import { VERSION } from "./core/config";

const HELP = `pi-internet-runtime ${VERSION}

Focused ChatGPT web-backed models for the native Codex harness.

Usage:
  pi-internet-runtime setup --browser-only [options]
  pi-internet-runtime setup --full --tunnel-id ID --runtime-key-file PATH [options]
  pi-internet-runtime login [--import-storage-state PATH]
  pi-internet-runtime doctor [--json]
  pi-internet-runtime browser check
  pi-internet-runtime serve
  pi-internet-runtime mcp [--broker-socket PATH]
  pi-internet-runtime service <status|install|start|restart|stop|cancel-turns>
  pi-internet-runtime tunnel <status|connect|disconnect|start|restart|stop|key-import>
  pi-internet-runtime open <tunnels|runtime-keys|connectors>
  pi-internet-runtime uninstall --yes

Setup options:
  --browser-only               Account-eligible Web models, full context/images, no local tools or tunnel
  --full                       Account-eligible Web models with tools; Pro remains read-only
  --port NUMBER                Loopback Responses port (default: 17841)
  --chrome PATH                Google Chrome/Chromium executable used for account login
  --refresh-account-capabilities
                               Re-read the authenticated account's available Web models
  --app-name NAME              ChatGPT connector name (default: ${DEFAULT_CONNECTOR_NAME})
  --tunnel-id ID               Existing OpenAI tunnel id (full mode)
  --runtime-key-file PATH      File containing a Tunnels Read+Use runtime key
  --restart-service            Explicitly restart this project's daemon after an update
  --login                      Refresh the stored ChatGPT login even if one exists
  --auto-approve-tool-calls    Opt in to per-call browser clicks on "Allow once" prompts
  --acknowledge-unofficial     Accept the one-time unofficial-browser-automation notice

Login options:
  --import-storage-state PATH  Validate and import a Playwright browser storage-state export

Global:
  --home PATH                  Override ~/.pi-internet-runtime
  -h, --help
  -v, --version
`;

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function takeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

async function confirm(question: string): Promise<boolean> {
  if (!stdin.isTTY || !stdout.isTTY) return false;
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await reader.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    reader.close();
  }
}

async function prompt(question: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) return "";
  const reader = createInterface({ input: stdin, output: stdout });
  try { return (await reader.question(question)).trim(); }
  finally { reader.close(); }
}

async function secretPrompt(question: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) return "";
  stdout.write(question);
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: stdin, output: muted, terminal: true });
  try { return (await reader.question("")).trim(); }
  finally {
    reader.close();
    stdout.write("\n");
  }
}

function assertNoArgs(args: string[]): void {
  if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(" ")}`);
}

async function loginCommand(args: string[]): Promise<void> {
  const importStorageState = takeOption(args, "--import-storage-state");
  assertNoArgs(args);
  const config = loadConfig();
  if (importStorageState && !isAbsolute(importStorageState)) {
    throw new Error("Imported browser storage state requires an absolute path");
  }
  const result = importStorageState
    ? await importChatGptLogin(config, importStorageState)
    : await loginToChatGpt(config);
  stdout.write(`ChatGPT login stored at ${result.storageStatePath}\n`);
}

async function setupCommand(args: string[]): Promise<void> {
  const browserOnly = takeFlag(args, "--browser-only");
  const full = takeFlag(args, "--full");
  if (browserOnly === full) throw new Error("Choose exactly one setup mode: --browser-only or --full");
  const portRaw = takeOption(args, "--port");
  let acknowledged = takeFlag(args, "--acknowledge-unofficial");
  const options: SetupOptions = {
    mode: full ? "full" : "browser-only",
    ...(portRaw ? { port: Number(portRaw) } : {}),
  };
  const appName = takeOption(args, "--app-name");
  const tunnelId = takeOption(args, "--tunnel-id");
  const runtimeKeyFile = takeOption(args, "--runtime-key-file");
  const chrome = takeOption(args, "--chrome");
  if (chrome) options.chromeExecutablePath = chrome;
  options.refreshAccountCapabilities = takeFlag(args, "--refresh-account-capabilities");
  if (appName) options.appName = appName;
  if (tunnelId) options.tunnelId = tunnelId;
  if (runtimeKeyFile) options.runtimeKeyFile = runtimeKeyFile;
  options.forceLogin = takeFlag(args, "--login");
  options.autoApproveToolCalls = takeFlag(args, "--auto-approve-tool-calls");
  options.restartService = takeFlag(args, "--restart-service");
  assertNoArgs(args);

  if (!acknowledged) {
    stdout.write(
      "This is independent, unofficial software. It automates your ChatGPT web session, can break when the UI changes, "
      + "and must not be used to evade usage limits or access controls.\n",
    );
    acknowledged = await confirm("Continue and store this acknowledgement?");
  }
  if (!acknowledged) throw new Error("Setup cancelled: acknowledgement was not provided");
  options.acknowledgedUnofficial = true;

  const existing = existsSync(getConfigPath()) ? loadConfigForSetup() : undefined;
  const reusableCredentials = existingFullSetupCredentials(existing);
  const needsTunnelId = !options.tunnelId && !reusableCredentials.tunnelId;
  const needsRuntimeKey = !options.runtimeKeyFile
    && !reusableCredentials.runtimeKey
    && !existsSync(managedRuntimeKeyPath());

  if (full && (needsTunnelId || needsRuntimeKey) && stdin.isTTY) {
    stdout.write("Full mode needs an OpenAI tunnel and a runtime key with Tunnels Read + Use.\n");
    stdout.write("Tunnels: https://platform.openai.com/settings/organization/tunnels\n");
    stdout.write("Runtime keys: https://platform.openai.com/settings/organization/api-keys\n");
    if (needsTunnelId) options.tunnelId = await prompt("Tunnel id: ");
    if (needsRuntimeKey) {
      options.runtimeKeyValue = await secretPrompt("Runtime key (hidden): ");
    }
  }

  const result = await setup(options);
  stdout.write(`Setup complete: ${result.mode}\n`);
  stdout.write(`Config: ${result.configPath}\n`);
  if (result.connectorSetupRequired) {
    stdout.write("One account-level step remains: attach the tunnel to the ChatGPT connector named in config.\n");
    stdout.write("Open: https://chatgpt.com/#settings/Plugins\n");
  }
  stdout.write("Restart the Pi internet extension once so its provider catalog refreshes.\n");
}

async function doctorCommand(args: string[]): Promise<void> {
  const json = takeFlag(args, "--json");
  assertNoArgs(args);
  const report = await runDoctor();
  stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatDoctorReport(report));
  if (!report.ok) process.exitCode = 1;
}

async function mcpCommand(args: string[]): Promise<void> {
  const brokerSocketPath = resolveBrokerEndpoint(
    takeOption(args, "--broker-socket") ?? defaultBrokerEndpoint(),
  );
  assertNoArgs(args);
  await runChatGptMcpServer({ brokerSocketPath });
}

async function serviceCommand(args: string[]): Promise<void> {
  const action = args.shift() ?? "status";
  assertNoArgs(args);
  const config = action === "status" ? undefined : loadConfig();
  if (action === "cancel-turns") {
    const cancelled = await cancelBrowserTurns(config!);
    stdout.write(`${JSON.stringify({ cancelledBrowserTurns: cancelled }, null, 2)}\n`);
    return;
  }
  const status = action === "status" ? getServiceStatus()
    : action === "install" ? installService(config!)
      : action === "start" ? startService()
        : action === "restart" ? await restartService(config!)
          : action === "stop" ? await stopService(config!)
            : undefined;
  if (!status) throw new Error(`Unknown service action: ${action}`);
  stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

async function tunnelCommand(args: string[]): Promise<void> {
  const action = args.shift() ?? "status";
  assertNoArgs(args);
  if (action === "key-import") {
    const key = await secretPrompt("Runtime key (hidden): ");
    if (!key) throw new Error("A non-empty runtime key is required");
    installRuntimeKeyBytes(key);
    stdout.write(`Runtime key stored privately at ${managedRuntimeKeyPath()}\n`);
    return;
  }
  const config = loadConfig();
  if (action === "connect") {
    connectTunnel(config);
    const status = await waitForTunnelReady(config);
    stdout.write(`${JSON.stringify({ runtime: status }, null, 2)}\n`);
    if (!status.ok) process.exitCode = 1;
    return;
  }
  if (action === "disconnect") {
    stopTunnel(config);
    stdout.write(`${JSON.stringify({ runtime: tunnelStatus(config) }, null, 2)}\n`);
    return;
  }
  if (action === "start") startTunnelService();
  else if (action === "restart") {
    await assertServiceIdle(config);
    await restartTunnelService();
  }
  else if (action === "stop") {
    await assertServiceIdle(config);
    await stopTunnelService();
    stopTunnel(config);
  }
  else if (action !== "status") throw new Error(`Unknown tunnel action: ${action}`);
  const status = action === "start" || action === "restart"
    ? await waitForTunnelReady(config)
    : tunnelStatus(config);
  const service = getTunnelServiceStatus();
  stdout.write(`${JSON.stringify({ service, runtime: status }, null, 2)}\n`);
  if (action !== "stop" && (!service.running || !status.ok)) process.exitCode = 1;
}

async function openCommand(args: string[]): Promise<void> {
  const target = args.shift();
  assertNoArgs(args);
  const urls: Record<string, string> = {
    tunnels: "https://platform.openai.com/settings/organization/tunnels",
    "runtime-keys": "https://platform.openai.com/settings/organization/api-keys",
    connectors: "https://chatgpt.com/#settings/Plugins",
  };
  const url = target ? urls[target] : undefined;
  if (!url) throw new Error("Choose one of: tunnels, runtime-keys, connectors");
  if (process.platform === "darwin") {
    const result = runCommand("open", [url]);
    if (result.status !== 0) throw new Error(result.stderr.trim() || `Could not open ${url}`);
  } else {
    stdout.write(`${url}\n`);
  }
}

async function uninstallCommand(args: string[]): Promise<void> {
  const yes = takeFlag(args, "--yes");
  const keepData = takeFlag(args, "--keep-data");
  assertNoArgs(args);
  if (!yes && !await confirm("Stop services and remove this installation?")) {
    throw new Error("Uninstall cancelled");
  }
  const config = existsSync(getConfigPath()) ? loadConfig() : undefined;
  if (!config && process.platform === "darwin" && getServiceStatus().installed) {
    throw new Error("Service exists but configuration is missing; refusing an unverifiable uninstall");
  }
  if (config && process.platform === "darwin") await assertServiceIdle(config);
  if (config?.mode === "full") {
    if (process.platform === "darwin") await uninstallTunnelService();
    stopTunnel(config);
  }
  if (config && process.platform === "darwin") await uninstallService(config);
  if (!keepData) rmSync(getConfigDir(), { recursive: true, force: true });
  stdout.write(keepData ? "Uninstalled; private application data was preserved.\n" : "Uninstalled and removed private application data.\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const home = takeOption(args, "--home");
  if (home) process.env.PI_INTERNET_RUNTIME_HOME = home;
  if (takeFlag(args, "--help") || takeFlag(args, "-h")) {
    stdout.write(HELP);
    return;
  }
  if (takeFlag(args, "--version") || takeFlag(args, "-v")) {
    stdout.write(`${VERSION}\n`);
    return;
  }
  const command = args.shift() ?? "help";
  if (command === "help") stdout.write(HELP);
  else if (command === "setup") await setupCommand(args);
  else if (command === "login") await loginCommand(args);
  else if (command === "doctor" || command === "status") await doctorCommand(args);
  else if (command === "browser") {
    const action = args.shift();
    assertNoArgs(args);
    if (action !== "check") throw new Error("Browser command must be: browser check");
    const config = loadConfig();
    await checkBrowserEngine(config);
    stdout.write("Playwright can launch the configured Chrome executable.\n");
  } else if (command === "serve") {
    assertNoArgs(args);
    const config = loadConfig();
    let resolveShutdown: () => void = () => {};
    const shutdown = new Promise<void>(resolve => { resolveShutdown = resolve; });
    const server = startServer(config, { onShutdown: resolveShutdown });
    stdout.write(`pi-internet-runtime ${VERSION} listening on http://${config.host}:${server.port}/v1 (${config.mode})\n`);
    await shutdown;
  } else if (command === "mcp") await mcpCommand(args);
  else if (command === "service") await serviceCommand(args);
  else if (command === "tunnel") await tunnelCommand(args);
  else if (command === "open") await openCommand(args);
  else if (command === "uninstall") await uninstallCommand(args);
  else throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch(error => {
  process.stderr.write(`pi-internet-runtime: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
