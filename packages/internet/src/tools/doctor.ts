import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { Type } from "typebox";
import { AccountRegistry } from "#internet/accounts/registry";
import type { DoctorReport } from "#internet/daemon/doctor";
import { runDaemonDoctor } from "#internet/daemon/doctor";

export function registerDoctorTool(host: Pick<ExtensionAPI, "registerTool">): void {
	host.registerTool({
		name: "internet_doctor",
		label: "Internet Doctor",
		description: "Run ChatGPT Web daemon diagnostics and return structured check results.",
		parameters: Type.Object({ account: Type.Optional(Type.String({ minLength: 1 })) }),
		async execute(_id, params, signal) {
			const account = await new AccountRegistry().get(params.account);
			const report = await runDaemonDoctor(account, { signal });
			return {
				content: [{ type: "text", text: formatDoctorReport(report) }],
				details: report,
			};
		},
	});
}

function formatDoctorReport(report: DoctorReport): string {
	const checks = report.checks.flatMap((check) => [
		`[${check.status}][${check.scope}] ${check.message}`,
		...(check.detail ? [`  ${check.detail}`] : []),
	]);
	return [...checks, report.ok ? "Doctor result: ready" : "Doctor result: not ready"].join("\n");
}
