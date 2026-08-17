import { createHash, randomUUID } from "node:crypto";

import { AsyncEventQueue } from "#runtime/core/event-queue";
import { readJsonRequestBody } from "#runtime/core/http-body";
import type { AdapterEvent } from "#runtime/core/protocol/types";
import { buildResponsesJson, responsesSse } from "#runtime/core/responses/bridge";
import { startHttpServer } from "#runtime/core/server";
import { GeminiWebAdapter } from "#runtime/providers/gemini-web/adapter";
import type { GeminiWebProviderConfig } from "#runtime/providers/gemini-web/config";
import { parseGeminiWebRequest } from "#runtime/providers/gemini-web/request";

export interface GeminiWebServerConfig extends GeminiWebProviderConfig {
  host: "127.0.0.1";
  port: number;
  controlToken: string;
  idleShutdownMs: number;
}

interface GeminiWebServerDependencies {
  onShutdown?: () => void;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function authorized(request: Request, token: string): boolean {
  return request.headers.get("authorization") === `Bearer ${token}`;
}

function errorResponse(error: unknown, status = 400): Response {
  const message = error instanceof Error ? error.message : String(error);
  return json({ error: { type: "invalid_request_error", message } }, status);
}

function sseResponse(events: AsyncIterable<AdapterEvent>, model: string, responseId: string): Response {
  return new Response(responsesSse(events, model, { responseId }), {
    headers: {
      "cache-control": "no-cache, no-store",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
}

export function startGeminiWebServer(
  config: GeminiWebServerConfig,
  dependencies: GeminiWebServerDependencies = {},
): ReturnType<typeof Bun.serve> {
  const adapter = new GeminiWebAdapter(config);
  const active = new Map<string, AbortController>();
  const configFingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  let acceptingTurns = true;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let shutdownStarted = false;

  const scheduleIdleShutdown = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
    if (shutdownStarted || config.idleShutdownMs <= 0 || active.size > 0) return;
    idleTimer = setTimeout(() => shutdown(), config.idleShutdownMs);
    idleTimer.unref?.();
  };

  const runTurn = async (request: Request): Promise<Response> => {
    if (!acceptingTurns) return errorResponse(new Error("Gemini Web runtime is draining"), 503);
    const raw = await readJsonRequestBody(request);
    const parsed = parseGeminiWebRequest(raw);
    const responseId = `resp_${randomUUID().replaceAll("-", "")}`;
    const queue = new AsyncEventQueue<AdapterEvent>();
    const controller = new AbortController();
    const abort = (): void => controller.abort(request.signal.reason);
    request.signal.addEventListener("abort", abort, { once: true });
    active.set(responseId, controller);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
    const completion = adapter.runTurn(parsed, { headers: request.headers, abortSignal: controller.signal }, event => queue.push(event))
      .catch(error => queue.push({ type: "error", message: error instanceof Error ? error.message : String(error) }))
      .finally(() => {
        request.signal.removeEventListener("abort", abort);
        active.delete(responseId);
        queue.close();
        scheduleIdleShutdown();
      });
    if (parsed.stream) return sseResponse(queue, parsed.modelId, responseId);
    await completion;
    return json(await buildResponsesJson(queue, parsed.modelId, { responseId }));
  };

  const shutdown = (): void => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    acceptingTurns = false;
    if (idleTimer) clearTimeout(idleTimer);
    for (const controller of active.values()) controller.abort(new Error("Gemini Web runtime is shutting down"));
    void adapter.close().finally(() => {
      void server.stop(true);
      dependencies.onShutdown?.();
    });
  };

  const server = startHttpServer({
    host: config.host,
    port: config.port,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/healthz") {
        return json({
          status: "ok",
          adapter: "gemini-web",
          config_fingerprint: configFingerprint,
          accepting_turns: acceptingTurns,
          active_http_turns: active.size,
          active_adapter_turns: adapter.activeTurnCount,
        });
      }
      if (request.method === "GET" && url.pathname === "/v1/models") {
        return json({ object: "list", data: config.models.map(id => ({ id, object: "model", owned_by: "gemini-web" })) });
      }
      if (request.method === "POST" && url.pathname === "/v1/responses") {
        try {
          return await runTurn(request);
        } catch (error) {
          return errorResponse(error);
        }
      }
      if (url.pathname.startsWith("/admin/")) {
        if (!authorized(request, config.controlToken)) return errorResponse(new Error("Unauthorized"), 401);
        if (request.method !== "POST") return errorResponse(new Error("Method not allowed"), 405);
        if (url.pathname === "/admin/drain") acceptingTurns = false;
        else if (url.pathname === "/admin/resume") acceptingTurns = true;
        else if (url.pathname === "/admin/cancel-browser-turns") {
          const cancelled = active.size;
          for (const controller of active.values()) controller.abort(new Error("Gemini Web turn cancelled"));
          return json({ cancelled_browser_turns: cancelled });
        } else if (url.pathname === "/admin/shutdown") {
          queueMicrotask(shutdown);
        } else if (url.pathname === "/admin/conversation-canary") {
          return errorResponse(new Error("Gemini Web does not support conversation canaries"), 400);
        } else {
          return errorResponse(new Error("Unsupported Gemini Web administration route"), 404);
        }
        return json({ ok: true });
      }
      if (url.pathname === "/v1/responses/compact") {
        return errorResponse(new Error("Gemini Web does not support this operation"), 400);
      }
      return errorResponse(new Error("Not found"), 404);
    },
  });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  scheduleIdleShutdown();
  return server;
}
