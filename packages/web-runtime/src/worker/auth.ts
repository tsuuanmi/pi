import { createHash, timingSafeEqual } from "node:crypto";

export function tunnelProof(profileId: string, profileDir: string, secret: string): string {
	return createHash("sha256").update(`${profileId}\0${profileDir}\0${secret}`, "utf8").digest("base64url");
}

export function matchesProof(expected: string, actual: string): boolean {
	const expectedBytes = Buffer.from(expected, "utf8");
	const actualBytes = Buffer.from(actual, "utf8");
	return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}
