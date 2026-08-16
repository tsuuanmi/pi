export interface HttpServerOptions {
  host: string;
  port: number;
  fetch(request: Request): Response | Promise<Response>;
}

/** Start the provider-neutral HTTP host used by runtime adapters. */
export function startHttpServer(options: HttpServerOptions): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    hostname: options.host,
    port: options.port,
    idleTimeout: 0,
    fetch: options.fetch,
  });
}
