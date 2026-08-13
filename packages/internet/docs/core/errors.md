# core/errors

Mirrors `src/core/errors.ts`.

Typed error for the package.

## `InternetErrorCode`

```ts
type InternetErrorCode =
  | "config_missing"
  | "config_invalid"
  | "daemon_unavailable"
  | "daemon_rejected"
  | "daemon_doctor_failed";
```

## `InternetErrorOptions`

```ts
interface InternetErrorOptions {
  code: InternetErrorCode;
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}
```

## `InternetError`

```ts
class InternetError extends Error
```

`Error` subclass carrying `code`, optional `status`, and a `retryable` flag (default `false`). It
passes `cause` through to the native `Error` cause.

## `isInternetError`

```ts
function isInternetError(error: unknown): error is InternetError
```

Type guard that returns true when `error` is an `InternetError`.
