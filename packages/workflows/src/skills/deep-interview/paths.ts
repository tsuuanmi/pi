import { join } from "node:path";
import { sessionSpecsDir } from "@tsuuanmi/pi/session/layout";
import { assertSafePathComponent } from "#workflows/state/state-schema";

export function deepInterviewSpecPath(cwd: string, slug: string, sessionId: string): string {
	assertSafePathComponent(slug, "slug");
	return join(sessionSpecsDir(cwd, sessionId), `deep-interview-${slug}.md`);
}

export function deepInterviewIndexPath(cwd: string, sessionId: string): string {
	return join(sessionSpecsDir(cwd, sessionId), "deep-interview-index.jsonl");
}
