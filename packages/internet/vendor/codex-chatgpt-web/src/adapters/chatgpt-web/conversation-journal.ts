import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { ConversationCheckpoint } from "./conversation-sync.js";

const CHATGPT_ORIGIN = "https://chatgpt.com";
const CONVERSATION_PATH = /^\/c\/([A-Za-z0-9_-]+)$/;

export type ConversationStatus = "creating" | "prepared" | "click_attempted" | "ready" | "conflicted";

export interface ConversationBinding {
  version: 1;
  revision: number;
  accountFingerprint: string;
  threadHash: string;
  status: ConversationStatus;
  conversationId?: string;
  conversationUrl?: string;
  checkpoint?: ConversationCheckpoint;
  pendingPrefixDigest?: string;
  pendingEventCount?: number;
  updatedAt: string;
}

export class ConversationJournal {
  private readonly root: string;
  private readonly accountFingerprint: string;

  constructor(root: string, accountFingerprint: string) {
    this.root = resolve(root);
    this.accountFingerprint = accountFingerprint;
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    chmodSync(this.root, 0o700);
  }

  read(threadId: string): ConversationBinding | undefined {
    const path = this.path(threadId);
    if (!existsSync(path)) return undefined;
    const metadata = statSync(path);
    if ((metadata.mode & 0o077) !== 0) throw new Error(`Conversation journal is not private: ${path}`);
    const binding = JSON.parse(readFileSync(path, "utf8")) as ConversationBinding;
    validateBinding(binding, this.accountFingerprint, threadHash(threadId));
    return binding;
  }

  create(threadId: string, prefixDigest: string, eventCount: number): ConversationBinding {
    if (this.read(threadId)) throw new Error("Conversation binding already exists");
    return this.write(threadId, undefined, {
      version: 1,
      revision: 1,
      accountFingerprint: this.accountFingerprint,
      threadHash: threadHash(threadId),
      status: "creating",
      pendingPrefixDigest: prefixDigest,
      pendingEventCount: eventCount,
      updatedAt: new Date().toISOString(),
    });
  }

  update(
    threadId: string,
    expectedRevision: number,
    update: (current: ConversationBinding) => ConversationBinding,
  ): ConversationBinding {
    const current = this.read(threadId);
    if (!current || current.revision !== expectedRevision) throw new Error("Conversation journal revision conflict");
    const next = update(structuredClone(current));
    next.version = 1;
    next.revision = current.revision + 1;
    next.accountFingerprint = current.accountFingerprint;
    next.threadHash = current.threadHash;
    next.updatedAt = new Date().toISOString();
    return this.write(threadId, expectedRevision, next);
  }

  markPrepared(threadId: string, revision: number, prefixDigest: string, eventCount: number): ConversationBinding {
    return this.update(threadId, revision, current => {
      if (current.status !== "ready") throw new Error(`Cannot prepare conversation from ${current.status}`);
      return { ...current, status: "prepared", pendingPrefixDigest: prefixDigest, pendingEventCount: eventCount };
    });
  }

  cancelCreating(threadId: string, revision: number): void {
    const current = this.read(threadId);
    if (!current || current.revision !== revision) throw new Error("Conversation journal revision conflict");
    if (current.status !== "creating") throw new Error(`Cannot cancel conversation creation from ${current.status}`);
    unlinkSync(this.path(threadId));
    fsyncDirectory(this.root);
  }

  cancelPrepared(threadId: string, revision: number): ConversationBinding {
    return this.update(threadId, revision, current => {
      if (current.status !== "prepared" || !current.checkpoint) {
        throw new Error(`Cannot cancel conversation preparation from ${current.status}`);
      }
      return {
        ...current,
        status: "ready",
        pendingPrefixDigest: undefined,
        pendingEventCount: undefined,
      };
    });
  }

  markClickAttempted(threadId: string, revision: number): ConversationBinding {
    return this.update(threadId, revision, current => {
      if (current.status !== "creating" && current.status !== "prepared") {
        throw new Error(`Cannot attempt conversation click from ${current.status}`);
      }
      return { ...current, status: "click_attempted" };
    });
  }

  markReady(
    threadId: string,
    revision: number,
    conversationUrl: string,
    checkpoint: ConversationCheckpoint,
  ): ConversationBinding {
    const conversation = parseConversationUrl(conversationUrl);
    return this.update(threadId, revision, current => {
      if (current.status !== "click_attempted") throw new Error(`Cannot acknowledge conversation from ${current.status}`);
      return {
        ...current,
        status: "ready",
        conversationId: conversation.id,
        conversationUrl: conversation.url,
        checkpoint,
        pendingPrefixDigest: undefined,
        pendingEventCount: undefined,
      };
    });
  }

  markConflicted(threadId: string, revision: number): ConversationBinding {
    return this.update(threadId, revision, current => ({ ...current, status: "conflicted" }));
  }

  private path(threadId: string): string {
    return join(this.root, `${threadHash(threadId)}.json`);
  }

  private write(threadId: string, expectedRevision: number | undefined, binding: ConversationBinding): ConversationBinding {
    validateBinding(binding, this.accountFingerprint, threadHash(threadId));
    const path = this.path(threadId);
    if (expectedRevision !== undefined) {
      const current = this.read(threadId);
      if (!current || current.revision !== expectedRevision) throw new Error("Conversation journal revision conflict");
    }
    writePrivateJson(path, binding);
    return binding;
  }
}

export function parseConversationUrl(value: string): { id: string; url: string } {
  const url = new URL(value);
  const match = url.origin === CHATGPT_ORIGIN && !url.search && !url.hash
    ? CONVERSATION_PATH.exec(url.pathname)
    : undefined;
  if (!match) throw new Error(`Invalid ChatGPT conversation URL: ${value}`);
  return { id: match[1], url: `${CHATGPT_ORIGIN}/c/${match[1]}` };
}

export function beginDurableConversationAuthority(
  root: string,
  accountFingerprint: string,
  runtimeDigest: string,
): void {
  const directory = resolve(root);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = join(directory, "authority.json");
  writePrivateJson(path, {
    version: 1,
    status: "in_progress",
    accountFingerprint,
    runtimeDigest,
    startedAt: new Date().toISOString(),
  });
}

export function writeDurableConversationAuthority(
  root: string,
  accountFingerprint: string,
  runtimeDigest: string,
  conversationUrl: string,
): void {
  const directory = resolve(root);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const conversation = parseConversationUrl(conversationUrl);
  const path = join(directory, "authority.json");
  writePrivateJson(path, {
    version: 1,
    status: "passed",
    accountFingerprint,
    runtimeDigest,
    conversationId: conversation.id,
    verifiedAt: new Date().toISOString(),
  });
}

export function conversationRuntimeDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function conversationAccountFingerprint(storageStatePath: string): string {
  return createHash("sha256").update(resolve(storageStatePath)).digest("hex");
}

export function assertDurableConversationAuthority(
  root: string,
  accountFingerprint: string,
  expectedRuntimeDigest: string,
): void {
  const path = join(resolve(root), "authority.json");
  if (!existsSync(path)) throw new Error("Durable ChatGPT conversations require a successful account canary");
  const metadata = statSync(path);
  if ((metadata.mode & 0o077) !== 0) throw new Error(`Conversation authority is not private: ${path}`);
  const authority = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (
    authority.version !== 1 ||
    authority.status !== "passed" ||
    authority.accountFingerprint !== accountFingerprint ||
    authority.runtimeDigest !== expectedRuntimeDigest ||
    !/^[a-f0-9]{64}$/.test(expectedRuntimeDigest)
  ) {
    throw new Error("Durable ChatGPT conversation authority is invalid or stale");
  }
}

function writePrivateJson(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  chmodSync(path, 0o600);
  fsyncDirectory(resolve(path, ".."));
}

function fsyncDirectory(path: string): void {
  const directoryFd = openSync(path, "r");
  try {
    fsyncSync(directoryFd);
  } finally {
    closeSync(directoryFd);
  }
}

function threadHash(threadId: string): string {
  return createHash("sha256").update(threadId).digest("hex");
}

function validateBinding(binding: ConversationBinding, accountFingerprint: string, expectedThreadHash: string): void {
  if (binding.version !== 1 || !Number.isSafeInteger(binding.revision) || binding.revision < 1) {
    throw new Error("Invalid conversation journal schema");
  }
  if (binding.accountFingerprint !== accountFingerprint) throw new Error("Conversation account mismatch");
  if (binding.threadHash !== expectedThreadHash) throw new Error("Conversation thread mismatch");
  if (!["creating", "prepared", "click_attempted", "ready", "conflicted"].includes(binding.status)) {
    throw new Error("Invalid conversation status");
  }
  if (binding.conversationUrl) {
    const parsed = parseConversationUrl(binding.conversationUrl);
    if (binding.conversationId !== parsed.id) throw new Error("Conversation identity mismatch");
  }
  if (binding.status === "ready" && (!binding.conversationUrl || !binding.checkpoint)) {
    throw new Error("Ready conversation is incomplete");
  }
}
