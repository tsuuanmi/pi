# browser/gemini-web/turn-driver

Mirrors `src/browser/gemini-web/turn-driver.ts`.

Serializes Gemini browser turns and resolves/records conversation state inside that critical section. It navigates, authenticates, selects the discovered model, submits initial or current-turn text, captures stable DOM output, stops aborted turns, and replaces pages after failure.
