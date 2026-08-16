import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	assertDurableConversationAuthority,
	beginDurableConversationAuthority,
	ConversationJournal,
	conversationAccountFingerprint,
	parseConversationUrl,
	writeDurableConversationAuthority,
} from "../../vendor/runtime/src/adapters/chatgpt-web/conversation/journal.js";
import {
	acknowledgedConversationCheckpoint,
	canonicalConversationEvents,
} from "../../vendor/runtime/src/adapters/chatgpt-web/conversation/sync.js";

describe("durable conversation journal", () => {
	it("persists private CAS transitions without prompt content", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-internet-conversations-"));
		const journal = new ConversationJournal(root, conversationAccountFingerprint("/account/state.json"));
		const created = journal.create("thread-1", "a".repeat(64), 1);
		const attempted = journal.markClickAttempted("thread-1", created.revision);
		const events = canonicalConversationEvents([{ type: "message", role: "user", content: "secret prompt" }]);
		const ready = journal.markReady(
			"thread-1",
			attempted.revision,
			"https://chatgpt.com/c/conversation_123",
			acknowledgedConversationCheckpoint(events, "authority", { ordinal: 1, text: "answer" }),
		);
		expect(ready).toMatchObject({ status: "ready", conversationId: "conversation_123" });
		const files = await import("node:fs/promises").then((fs) => fs.readdir(root));
		const path = join(root, files[0]);
		expect((await stat(root)).mode & 0o777).toBe(0o700);
		expect((await stat(path)).mode & 0o777).toBe(0o600);
		const raw = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
		expect(raw).not.toContain("secret prompt");
		await expect(
			Promise.resolve().then(() => journal.markConflicted("thread-1", attempted.revision)),
		).rejects.toThrow("revision conflict");
	});

	it("removes a genesis binding that fails before the submit attempt", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-internet-creating-rollback-"));
		const journal = new ConversationJournal(root, conversationAccountFingerprint("/account/state.json"));
		const created = journal.create("thread-1", "a".repeat(64), 1);
		journal.cancelCreating("thread-1", created.revision);
		expect(journal.read("thread-1")).toBeUndefined();
	});

	it("rolls back a continuation that fails before the submit attempt", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-internet-prepared-rollback-"));
		const journal = new ConversationJournal(root, conversationAccountFingerprint("/account/state.json"));
		const created = journal.create("thread-1", "a".repeat(64), 1);
		const attempted = journal.markClickAttempted("thread-1", created.revision);
		const events = canonicalConversationEvents([{ type: "message", role: "user", content: "question" }]);
		const ready = journal.markReady(
			"thread-1",
			attempted.revision,
			"https://chatgpt.com/c/conversation_123",
			acknowledgedConversationCheckpoint(events, "authority", { ordinal: 1, text: "answer" }),
		);
		const prepared = journal.markPrepared("thread-1", ready.revision, "b".repeat(64), 2);
		expect(journal.cancelPrepared("thread-1", prepared.revision)).toMatchObject({
			status: "ready",
			pendingPrefixDigest: undefined,
			pendingEventCount: undefined,
		});
	});

	it("keeps one ChatGPT conversation identity across session turns", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-internet-conversation-identity-"));
		const journal = new ConversationJournal(root, conversationAccountFingerprint("/account/state.json"));
		const firstEvents = canonicalConversationEvents([{ type: "message", role: "user", content: "first" }]);
		const created = journal.create("thread-1", "a".repeat(64), 1);
		const firstAttempt = journal.markClickAttempted("thread-1", created.revision);
		const first = journal.markReady(
			"thread-1",
			firstAttempt.revision,
			"https://chatgpt.com/c/conversation_123",
			acknowledgedConversationCheckpoint(firstEvents, "authority", { ordinal: 1, text: "first answer" }),
		);
		const prepared = journal.markPrepared("thread-1", first.revision, "b".repeat(64), 2);
		const secondAttempt = journal.markClickAttempted("thread-1", prepared.revision);
		const second = journal.markReady(
			"thread-1",
			secondAttempt.revision,
			"https://chatgpt.com/c/conversation_123",
			acknowledgedConversationCheckpoint(firstEvents, "authority", { ordinal: 2, text: "second answer" }),
		);
		expect(second.conversationId).toBe("conversation_123");

		const nextPrepared = journal.markPrepared("thread-1", second.revision, "c".repeat(64), 3);
		const nextAttempt = journal.markClickAttempted("thread-1", nextPrepared.revision);
		expect(() =>
			journal.markReady(
				"thread-1",
				nextAttempt.revision,
				"https://chatgpt.com/c/conversation_456",
				acknowledgedConversationCheckpoint(firstEvents, "authority", { ordinal: 3, text: "wrong chat" }),
			),
		).toThrow("identity changed");
	});

	it("marks ambiguous clicks conflicted and does not permit continuation", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-internet-conflict-"));
		const journal = new ConversationJournal(root, conversationAccountFingerprint("/account/state.json"));
		const created = journal.create("thread-1", "a".repeat(64), 1);
		const attempted = journal.markClickAttempted("thread-1", created.revision);
		const conflicted = journal.markConflicted("thread-1", attempted.revision);
		expect(conflicted.status).toBe("conflicted");
		expect(() => journal.markPrepared("thread-1", conflicted.revision, "b".repeat(64), 2)).toThrow(
			"Cannot prepare conversation from conflicted",
		);
	});

	it("invalidates prior authority before canary and binds success to the runtime digest", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-internet-authority-"));
		const account = conversationAccountFingerprint("/account/state.json");
		beginDurableConversationAuthority(root, account, "a".repeat(64));
		expect(() => assertDurableConversationAuthority(root, account, "a".repeat(64))).toThrow("invalid or stale");
		writeDurableConversationAuthority(root, account, "a".repeat(64), "https://chatgpt.com/c/canary_123");
		expect(() => assertDurableConversationAuthority(root, account, "a".repeat(64))).not.toThrow();
		expect(() => assertDurableConversationAuthority(root, account, "b".repeat(64))).toThrow("invalid or stale");
	});

	it("accepts only canonical ChatGPT conversation URLs", () => {
		expect(parseConversationUrl("https://chatgpt.com/c/abc_123")).toEqual({
			id: "abc_123",
			url: "https://chatgpt.com/c/abc_123",
		});
		for (const url of [
			"http://chatgpt.com/c/abc",
			"https://evil.example/c/abc",
			"https://chatgpt.com/c/abc?x=1",
			"https://chatgpt.com/share/abc",
		]) {
			expect(() => parseConversationUrl(url)).toThrow("Invalid ChatGPT conversation URL");
		}
	});

	it("rejects account-profile mismatches without rewriting state", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-internet-account-mismatch-"));
		new ConversationJournal(root, conversationAccountFingerprint("/account/a.json")).create(
			"thread-1",
			"a".repeat(64),
			1,
		);
		const wrong = new ConversationJournal(root, conversationAccountFingerprint("/account/b.json"));
		expect(() => wrong.read("thread-1")).toThrow("Conversation account mismatch");
	});
});
