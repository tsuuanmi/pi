import { describe, expect, test } from "vitest";
import { matchesProof, tunnelProof } from "../../src/worker/auth.ts";

describe("worker handshake", () => {
	test("matches only the expected profile secret proof", () => {
		const proof = tunnelProof("profile", "/profiles/profile", "secret");
		expect(matchesProof(proof, proof)).toBe(true);
		expect(matchesProof(proof, tunnelProof("profile", "/profiles/profile", "other"))).toBe(false);
		expect(matchesProof(proof, tunnelProof("other", "/profiles/profile", "secret"))).toBe(false);
	});
});
