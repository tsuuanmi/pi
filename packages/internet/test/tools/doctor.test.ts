import { AccountRegistry } from "#internet/accounts/registry";
import * as doctor from "#internet/daemon/doctor";
import { registerDoctorTool } from "#internet/tools/doctor";
import { captureTools } from "#internet-test/tools/helpers";

describe("internet_doctor", () => {
	it("returns structured diagnostics and a readable summary", async () => {
		vi.spyOn(AccountRegistry.prototype, "get").mockResolvedValue({ id: "default" } as never);
		vi.spyOn(doctor, "runDaemonDoctor").mockResolvedValue({
			ok: false,
			mode: "browser-only",
			upstreamOk: false,
			checks: [
				{ id: "config", status: "ok", message: "Configuration is valid", scope: "pi" },
				{ id: "login", status: "error", message: "Login is missing", detail: "Run login", scope: "pi" },
			],
		});
		const tool = captureTools(registerDoctorTool).get("internet_doctor");
		const signal = new AbortController().signal;
		const result = await tool?.execute("call", {}, signal, undefined, {} as never);
		expect(doctor.runDaemonDoctor).toHaveBeenCalledWith(expect.objectContaining({ id: "default" }), { signal });
		expect(result?.details).toMatchObject({ ok: false, mode: "browser-only" });
		expect(result?.content).toEqual([
			{
				type: "text",
				text: "[ok][pi] Configuration is valid\n[error][pi] Login is missing\n  Run login\nDoctor result: not ready",
			},
		]);
	});
});
