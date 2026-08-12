import { DAEMON_ROUTES } from "#internet/backends/openai/daemon/routes";

describe("DAEMON_ROUTES", () => {
	it("matches the daemon HTTP surface", () => {
		expect(DAEMON_ROUTES.health).toBe("/healthz");
		expect(DAEMON_ROUTES.compact).toBe("/v1/responses/compact");
		expect(DAEMON_ROUTES.control.shutdown).toBe("/admin/shutdown");
	});
});
