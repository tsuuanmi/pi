import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import type { SubagentManagerApi } from "#orchestrator/subagent/manager-api";
import type {
	SubagentDelivery,
	SubagentRequest,
	SubagentResumeResult,
	SubagentRunResult,
} from "#orchestrator/subagent/types";

export const PROTECTED_PERMIT_TTL_MS = 30_000;

export type ProtectedOperation = "spawn" | "resume" | "steer";
export type ProtectedSubject = { profile: string; role: string } | { subagentId: string };

export interface ProtectedSubagentPolicySpec {
	policyId: string;
	protectedProfiles: readonly string[];
	protectedRoles: readonly string[];
}

interface ProtectedPermitScope {
	policyId: string;
	operation: ProtectedOperation;
	sessionId: string;
	attemptId: string;
	subject: ProtectedSubject;
	capabilitySnapshotDigest: string;
	issuedAt: number;
	expiresAt: number;
	used: boolean;
}

interface ProtectedAuthorization {
	policyId: string;
	operation: ProtectedOperation;
	sessionId: string;
	attemptId: string;
	capabilitySnapshotDigest: string;
	subject: ProtectedSubject;
}

/** Opaque in-process object capability. Its scope is private and never serializable. */
export type ProtectedPermit = object;

const RESERVED_PROTECTED_SELECTORS = new Set(["researcher"]);

const permits = new WeakMap<object, ProtectedPermitScope>();
const policies = new Map<string, ProtectedSubagentPolicyHandle>();
const authorization = new AsyncLocalStorage<ProtectedAuthorization>();

function normalizedSelectors(values: readonly string[], field: string): readonly string[] {
	const result = values.map((value) => value.trim());
	if (result.some((value) => value.length === 0)) throw new Error(`${field} must not contain empty selectors`);
	if (new Set(result).size !== result.length) throw new Error(`${field} must not contain duplicate selectors`);
	return Object.freeze([...result]);
}

function sameSelectors(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function subjectMatches(left: ProtectedSubject, right: ProtectedSubject): boolean {
	if ("subagentId" in left || "subagentId" in right) {
		return "subagentId" in left && "subagentId" in right && left.subagentId === right.subagentId;
	}
	return left.profile === right.profile && left.role === right.role;
}

function operationSubject(operation: ProtectedOperation, subject: ProtectedSubject): ProtectedSubject {
	if (operation === "spawn" && "subagentId" in subject) {
		throw new Error("protected spawn permits require a profile and role subject");
	}
	if (operation !== "spawn" && !("subagentId" in subject)) {
		throw new Error(`${operation} permits require a subagent id subject`);
	}
	return { ...subject };
}

function failProtected(reason: string): never {
	throw new Error(reason);
}

function consumePermit(
	permit: ProtectedPermit,
	policy: ProtectedSubagentPolicyHandle,
	operation: ProtectedOperation,
	sessionId: string,
	subject: ProtectedSubject,
	capabilitySnapshotDigest: string,
): ProtectedPermitScope {
	const scope = permits.get(permit);
	if (!scope) failProtected("protected_permit_invalid");
	if (scope.used) failProtected("protected_permit_used");
	if (scope.policyId !== policy.policyId) failProtected("protected_permit_policy_mismatch");
	if (scope.operation !== operation) failProtected("protected_permit_operation_mismatch");
	if (scope.sessionId !== sessionId) failProtected("protected_permit_session_mismatch");
	if (scope.capabilitySnapshotDigest !== capabilitySnapshotDigest) failProtected("protected_permit_snapshot_mismatch");
	if (!subjectMatches(scope.subject, subject)) failProtected("protected_permit_subject_mismatch");
	if (scope.expiresAt <= Date.now()) failProtected("protected_permit_expired");
	scope.used = true;
	return scope;
}

async function runAuthorized<T>(
	scope: ProtectedPermitScope,
	operation: ProtectedOperation,
	fn: () => Promise<T>,
): Promise<T> {
	return authorization.run(
		{
			policyId: scope.policyId,
			operation,
			sessionId: scope.sessionId,
			attemptId: scope.attemptId,
			capabilitySnapshotDigest: scope.capabilitySnapshotDigest,
			subject: scope.subject,
		},
		fn,
	);
}

export class ProtectedSubagentPolicyHandle {
	readonly policyId: string;
	readonly protectedProfiles: readonly string[];
	readonly protectedRoles: readonly string[];

	constructor(spec: ProtectedSubagentPolicySpec) {
		const policyId = spec.policyId.trim();
		if (!policyId) throw new Error("protected policyId must not be empty");
		this.policyId = policyId;
		this.protectedProfiles = normalizedSelectors(spec.protectedProfiles, "protectedProfiles");
		this.protectedRoles = normalizedSelectors(spec.protectedRoles, "protectedRoles");
	}

	isProtected(profile: string | undefined, role: string | undefined): boolean {
		return (
			(profile !== undefined && this.protectedProfiles.includes(profile)) ||
			(role !== undefined && this.protectedRoles.includes(role))
		);
	}

	issuePermit(input: {
		operation: ProtectedOperation;
		sessionId: string;
		subject: ProtectedSubject;
		capabilitySnapshotDigest: string;
	}): ProtectedPermit {
		if (!input.sessionId.trim()) throw new Error("protected permits require a session id");
		if (!input.capabilitySnapshotDigest.trim()) throw new Error("protected permits require a snapshot digest");
		const subject = operationSubject(input.operation, input.subject);
		if (
			input.operation === "spawn" &&
			("subagentId" in subject || !this.isProtected(subject.profile, subject.role))
		) {
			throw new Error("protected spawn subject is not selected by policy");
		}
		const permit = Object.freeze({});
		permits.set(permit, {
			policyId: this.policyId,
			operation: input.operation,
			sessionId: input.sessionId,
			attemptId: randomBytes(16).toString("hex"),
			subject,
			capabilitySnapshotDigest: input.capabilitySnapshotDigest,
			issuedAt: Date.now(),
			expiresAt: Date.now() + PROTECTED_PERMIT_TTL_MS,
			used: false,
		});
		return permit;
	}

	async guardedSpawn(
		manager: SubagentManagerApi,
		request: SubagentRequest,
		permit: ProtectedPermit,
	): Promise<SubagentRunResult> {
		const sessionId = request.storageSessionId ?? request.parentSessionId;
		if (!sessionId) failProtected("protected spawn requires a storage session");
		const subject = { profile: request.agent ?? "", role: request.role ?? "" };
		const scope = consumePermit(permit, this, "spawn", sessionId, subject, request.capabilitySnapshotDigest ?? "");
		return runAuthorized(scope, "spawn", () => manager.spawn(request));
	}

	async guardedResume(
		manager: SubagentManagerApi,
		id: string,
		message: string,
		options: Parameters<SubagentManagerApi["resume"]>[2],
		permit: ProtectedPermit,
		capabilitySnapshotDigest: string,
	): Promise<SubagentResumeResult> {
		const sessionId = options.storageSessionId;
		if (!sessionId) failProtected("protected resume requires a storage session");
		const scope = consumePermit(permit, this, "resume", sessionId, { subagentId: id }, capabilitySnapshotDigest);
		return runAuthorized(scope, "resume", () => manager.resume(id, message, options));
	}

	async guardedSteer(
		manager: SubagentManagerApi,
		id: string,
		message: string,
		delivery: SubagentDelivery,
		sessionId: string,
		permit: ProtectedPermit,
		capabilitySnapshotDigest: string,
	): Promise<SubagentResumeResult> {
		const scope = consumePermit(permit, this, "steer", sessionId, { subagentId: id }, capabilitySnapshotDigest);
		return runAuthorized(scope, "steer", () => manager.steer(id, message, delivery, sessionId));
	}
}

export function registerProtectedSubagentPolicy(spec: ProtectedSubagentPolicySpec): ProtectedSubagentPolicyHandle {
	const existing = policies.get(spec.policyId);
	if (existing) {
		if (
			!sameSelectors(existing.protectedProfiles, spec.protectedProfiles) ||
			!sameSelectors(existing.protectedRoles, spec.protectedRoles)
		) {
			throw new Error(`protected policy already registered with different selectors: ${spec.policyId}`);
		}
		return existing;
	}
	const handle = new ProtectedSubagentPolicyHandle(spec);
	policies.set(handle.policyId, handle);
	return handle;
}

export function getProtectedSubagentPolicies(): readonly ProtectedSubagentPolicyHandle[] {
	return [...policies.values()];
}

export function isProtectedSubagentRequest(agent: string | undefined, role: string | undefined): boolean {
	if ((agent && RESERVED_PROTECTED_SELECTORS.has(agent)) || (role && RESERVED_PROTECTED_SELECTORS.has(role)))
		return true;
	return [...policies.values()].some((policy) => policy.isProtected(agent, role));
}

export function protectedPolicyForRequest(
	agent: string | undefined,
	role: string | undefined,
): ProtectedSubagentPolicyHandle | undefined {
	return [...policies.values()].find((policy) => policy.isProtected(agent, role));
}

export function currentProtectedAuthorization(): ProtectedAuthorization | undefined {
	return authorization.getStore();
}

export function assertProtectedAuthorization(input: {
	operation: ProtectedOperation;
	sessionId: string;
	policyId?: string;
	subject?: ProtectedSubject;
}): ProtectedAuthorization {
	const value = authorization.getStore();
	if (!value) failProtected("protected_subagent_requires_guarded_surface");
	if (value.operation !== input.operation) failProtected("protected_permit_operation_mismatch");
	if (value.sessionId !== input.sessionId) failProtected("protected_permit_session_mismatch");
	if (input.policyId && value.policyId !== input.policyId) failProtected("protected_permit_policy_mismatch");
	if (input.subject && !subjectMatches(value.subject, input.subject))
		failProtected("protected_permit_subject_mismatch");
	return value;
}

export function clearProtectedSubagentPolicies(): void {
	policies.clear();
}
