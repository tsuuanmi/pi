import { lstatSync, readFileSync } from "node:fs";

const MAX_STORAGE_STATE_BYTES = 10 * 1024 * 1024;
const allowedDomains = ["chatgpt.com", "openai.com"] as const;

type SameSite = "Strict" | "Lax" | "None";

export interface ChatGptStorageCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: SameSite;
  partitionKey?: string;
}

export interface ChatGptStorageOrigin {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

export interface ChatGptStorageState {
  cookies: ChatGptStorageCookie[];
  origins: ChatGptStorageOrigin[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function allowedHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\./, "");
  return allowedDomains.some(domain => normalized === domain || normalized.endsWith(`.${domain}`));
}

function sanitizeCookie(value: unknown): ChatGptStorageCookie | undefined {
  if (!isRecord(value) || typeof value.domain !== "string" || !allowedHost(value.domain)) return undefined;
  if (
    typeof value.name !== "string"
    || typeof value.value !== "string"
    || typeof value.path !== "string"
    || typeof value.expires !== "number"
    || typeof value.httpOnly !== "boolean"
    || typeof value.secure !== "boolean"
    || (value.sameSite !== "Strict" && value.sameSite !== "Lax" && value.sameSite !== "None")
    || (value.partitionKey !== undefined && typeof value.partitionKey !== "string")
  ) {
    throw new Error(`Invalid browser cookie for ${value.domain}.`);
  }
  return {
    name: value.name,
    value: value.value,
    domain: value.domain,
    path: value.path,
    expires: value.expires,
    httpOnly: value.httpOnly,
    secure: value.secure,
    sameSite: value.sameSite,
    ...(value.partitionKey === undefined ? {} : { partitionKey: value.partitionKey }),
  };
}

function sanitizeOrigin(value: unknown): ChatGptStorageOrigin | undefined {
  if (!isRecord(value) || typeof value.origin !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(value.origin);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || !allowedHost(url.hostname)) return undefined;
  if (!Array.isArray(value.localStorage)) throw new Error(`Invalid local storage for ${value.origin}.`);
  const localStorage = value.localStorage.map(entry => {
    if (!isRecord(entry) || typeof entry.name !== "string" || typeof entry.value !== "string") {
      throw new Error(`Invalid local storage entry for ${value.origin}.`);
    }
    return { name: entry.name, value: entry.value };
  });
  return { origin: url.origin, localStorage };
}

export function sanitizeChatGptStorageState(value: unknown): ChatGptStorageState {
  if (!isRecord(value) || !Array.isArray(value.cookies) || !Array.isArray(value.origins)) {
    throw new Error("Browser storage state must contain cookies and origins arrays.");
  }
  const cookies = value.cookies.map(sanitizeCookie).filter(cookie => cookie !== undefined);
  const origins = value.origins.map(sanitizeOrigin).filter(origin => origin !== undefined);
  if (cookies.length === 0) throw new Error("Browser storage state contains no ChatGPT or OpenAI cookies.");
  return { cookies, origins };
}

export function readChatGptStorageState(path: string): ChatGptStorageState {
  const file = lstatSync(path);
  if (file.isSymbolicLink() || !file.isFile()) throw new Error("Browser storage state must be a regular file.");
  if (file.size === 0 || file.size > MAX_STORAGE_STATE_BYTES) {
    throw new Error("Browser storage state must be non-empty and no larger than 10 MiB.");
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error("Browser storage state is not valid JSON.", { cause });
  }
  return sanitizeChatGptStorageState(value);
}
