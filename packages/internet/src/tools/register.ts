import type { InternetToolHost } from "#internet/tool/host";
import { registerAccountsTools } from "#internet/tools/accounts";
import { registerCompactTools } from "#internet/tools/compact";
import { registerControlTools } from "#internet/tools/control";
import { registerStatusTools } from "#internet/tools/status";

export function registerInternetTools(host: InternetToolHost): void {
	registerAccountsTools(host);
	registerStatusTools(host);
	registerControlTools(host);
	registerCompactTools(host);
}
