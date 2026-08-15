# tools/daemon

Mirrors `src/tools/daemon.ts`.

`internet_daemon` owns ChatGPT Web login, start, stop, restart, and status operations. `account` is
optional and defaults to the first enabled ChatGPT Web account.

For `action: "login"`, optional `storageStatePath` imports a Playwright storage-state JSON file. The
manager passes an absolute path to the bundled daemon, which retains only ChatGPT/OpenAI origins,
verifies the session through its owned browser, and persists it only after successful verification.
The field is rejected for every other action. Interactive headed login remains the normal path when
no import is supplied.
