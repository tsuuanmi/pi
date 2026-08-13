import { describe, expect, it, vi } from "vitest";
import type { SubagentManagerApi } from "#orchestrator/subagent/manager-api";
import {
	clearProtectedSubagentPolicies,
	registerProtectedSubagentPolicy,
} from "#orchestrator/subagent/protected-policy";

function manager(spawn = vi.fn()): SubagentManagerApi {
	return { spawn } as unknown as SubagentManagerApi;
}

describe("protected subagent policy", () => {
	it("requires a scoped one-use permit for protected spawn", async () => {
		clearProtectedSubagentPolicies();
		const policy = registerProtectedSubagentPolicy({
			policyId: "test/researcher",
			protectedProfiles: ["researcher"],
			protectedRoles: ["researcher"],
		});
		const spawn = vi.fn(async () => ({ record: { id: "research-1" }, output: "done" }));
		const target = manager(spawn);
		const request = {
			agent: "researcher",
			role: "researcher",
			prompt: "research",
			storageSessionId: "session-1",
			capabilitySnapshotDigest: "snapshot",
		};
		const permit = policy.issuePermit({
			operation: "spawn",
			sessionId: "session-1",
			subject: { profile: "researcher", role: "researcher" },
			capabilitySnapshotDigest: "snapshot",
		});
		await expect(policy.guardedSpawn(target, request, permit)).resolves.toMatchObject({ output: "done" });
		expect(spawn).toHaveBeenCalledTimes(1);
		await expect(policy.guardedSpawn(target, request, permit)).rejects.toThrow("protected_permit_used");
		expect(spawn).toHaveBeenCalledTimes(1);
	});

	it("rejects mismatched snapshots before manager execution", async () => {
		clearProtectedSubagentPolicies();
		const policy = registerProtectedSubagentPolicy({
			policyId: "test/researcher",
			protectedProfiles: ["researcher"],
			protectedRoles: ["researcher"],
		});
		const spawn = vi.fn();
		const permit = policy.issuePermit({
			operation: "spawn",
			sessionId: "session-1",
			subject: { profile: "researcher", role: "researcher" },
			capabilitySnapshotDigest: "expected",
		});
		await expect(
			policy.guardedSpawn(
				manager(spawn),
				{
					agent: "researcher",
					role: "researcher",
					prompt: "research",
					storageSessionId: "session-1",
					capabilitySnapshotDigest: "different",
				},
				permit,
			),
		).rejects.toThrow("protected_permit_snapshot_mismatch");
		expect(spawn).not.toHaveBeenCalled();
	});
});
