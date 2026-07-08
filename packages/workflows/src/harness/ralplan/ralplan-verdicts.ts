/**
 * Ralplan verdict parsing — R-1 prerequisite.
 *
 * Critic and architect role agents are prompted to emit a compact verdict in
 * their persisted artifact:
 *   - critic:     APPROVE | ITERATE | REJECT
 *   - architect:  CLEAR | WATCH | BLOCK, plus APPROVE | COMMENT | REQUEST CHANGES
 *
 * The runtime never parsed these — the verdicts lived only in role text. R-1
 * dual-writes typed obstacles from them, so we need a structured verdict first.
 *
 * The parser is FAIL-OPEN and PRECISION-BIASED: it never throws, and when it
 * cannot confidently identify the verdict it returns `undefined`. A false
 * negative (missed verdict) is safe — R-1 simply won't dual-write an obstacle;
 * a false positive (wrong verdict) could create a wrong obstacle, so the parser
 * biases toward precision. It is a pure leaf module with no harness
 * dependencies so it can be unit-tested in isolation.
 */

export type RalplanCriticVerdictKind = "approve" | "iterate" | "reject";
export type RalplanArchitectClarity = "clear" | "watch" | "block";
export type RalplanArchitectRecommendation = "approve" | "comment" | "request_changes";

export interface RalplanCriticVerdict {
	role: "critic";
	verdict: RalplanCriticVerdictKind;
	rationale?: string;
}

export interface RalplanArchitectVerdict {
	role: "architect";
	clarity: RalplanArchitectClarity;
	recommendation: RalplanArchitectRecommendation;
	rationale?: string;
}

export type RalplanVerdict = RalplanCriticVerdict | RalplanArchitectVerdict;

/** Lines that signal a verdict/recommendation section (case-insensitive). */
const VERDICT_CONTEXT = /verdict|recommendation|clarity|decision|conclusion/i;

const CRITIC_RE = /\b(approve|iterate|reject)\b/i;
const ARCHITECT_CLARITY_RE = /\b(clear|watch|block)\b/i;
const ARCHITECT_REC_PHRASE_RE = /\brequest[ _-]changes\b/i;
const ARCHITECT_REC_RE = /\b(approve|comment)\b/i;
const RATIONALE_RE = /^\s*(rationale|because|reason)\s*[:-]\s*(.+?)\s*$/i;

/**
 * Build a search window from lines that look like a verdict/recommendation
 * section, including the line immediately after each (for `Verdict:\nAPPROVE`
 * layouts). Returns "" when no verdict-ish line exists — callers use that to
 * decide whether to fall back to the full text.
 */
function verdictWindow(text: string): string {
	const lines = text.split(/\r?\n/);
	const window: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (VERDICT_CONTEXT.test(lines[i])) {
			window.push(lines[i]);
			if (i + 1 < lines.length) window.push(lines[i + 1]);
		}
	}
	return window.join("\n");
}

function extractRationale(text: string): string | undefined {
	for (const line of text.split(/\r?\n/)) {
		const match = RATIONALE_RE.exec(line);
		if (match) return match[2];
	}
	return undefined;
}

function parseCriticVerdict(text: string): RalplanCriticVerdict | undefined {
	// Prefer the verdict-context window; fall back to the full text. "iterate"
	// and "reject" are distinctive, and a false "approve" is harmless (approve
	// produces no obstacle), so the full-text fallback is acceptable for critic.
	const window = verdictWindow(text);
	let match = window ? CRITIC_RE.exec(window) : null;
	if (!match) match = CRITIC_RE.exec(text);
	if (!match) return undefined;
	const verdict = match[1].toLowerCase() as RalplanCriticVerdictKind;
	const rationale = extractRationale(text);
	return { role: "critic", verdict, ...(rationale ? { rationale } : {}) };
}

function parseArchitectVerdict(text: string): RalplanArchitectVerdict | undefined {
	// "clear", "watch", "block" are common English words; require a
	// verdict-ish context line to avoid false positives from prose.
	const window = verdictWindow(text);
	if (!window) return undefined;
	const clarityMatch = ARCHITECT_CLARITY_RE.exec(window);
	if (!clarityMatch) return undefined;
	const clarity = clarityMatch[1].toLowerCase() as RalplanArchitectClarity;
	const recommendation: RalplanArchitectRecommendation | undefined = ARCHITECT_REC_PHRASE_RE.test(window)
		? "request_changes"
		: (() => {
				const recMatch = ARCHITECT_REC_RE.exec(window);
				return recMatch ? (recMatch[1].toLowerCase() as "approve" | "comment") : undefined;
			})();
	if (!recommendation) return undefined;
	const rationale = extractRationale(text);
	return { role: "architect", clarity, recommendation, ...(rationale ? { rationale } : {}) };
}

/**
 * Parse a critic/architect verdict from free-form artifact text. Returns
 * `undefined` when no confident verdict is found (fail-open). Never throws.
 */
export function parseRalplanVerdict(role: "critic" | "architect", text: string): RalplanVerdict | undefined {
	if (typeof text !== "string" || text.length === 0) return undefined;
	try {
		return role === "critic" ? parseCriticVerdict(text) : parseArchitectVerdict(text);
	} catch {
		return undefined;
	}
}

/**
 * Minimal shape guard for a verdict read back from the index. Fail-open: a
 * malformed verdict is dropped (the row stays valid), never thrown.
 */
export function isRalplanVerdict(value: unknown): value is RalplanVerdict {
	if (!value || typeof value !== "object") return false;
	const verdict = value as Record<string, unknown>;
	if (verdict.role === "critic") {
		return (
			(verdict.verdict === "approve" || verdict.verdict === "iterate" || verdict.verdict === "reject") &&
			(verdict.rationale === undefined || typeof verdict.rationale === "string")
		);
	}
	if (verdict.role === "architect") {
		return (
			(verdict.clarity === "clear" || verdict.clarity === "watch" || verdict.clarity === "block") &&
			(verdict.recommendation === "approve" ||
				verdict.recommendation === "comment" ||
				verdict.recommendation === "request_changes") &&
			(verdict.rationale === undefined || typeof verdict.rationale === "string")
		);
	}
	return false;
}
