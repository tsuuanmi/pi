/**
 * Ralplan pre-execution vagueness gate.
 *
 * Classifies prompt specificity for `team`/`ultragoal` dispatch. A vague
 * prompt (no concrete signals AND word count ≤ threshold) is redirected to
 * `ralplan` with an explanatory message. Specific prompts pass through. A
 * `force:` or `!` prefix bypasses the gate.
 *
 * Aligned with gajae-code's vagueness-gate design but uses Pi-native
 * terminology and thresholds.
 */

/** Minimum number of words before a prompt without concrete signals is gated. */
export const VAGUENESS_WORD_COUNT_THRESHOLD = 15;

/** Concrete signal patterns that pass the gate regardless of word count. */
const CONCRETE_SIGNAL_PATTERNS: RegExp[] = [
	/\/[\w.-]+\.\w{1,10}(\s|$)/, // file paths like /src/foo.ts
	/#\d+/, // issue numbers like #123
	/\bPR\s*\d+/i, // PR references like PR 42
	/\bissue\s+\d+/i, // issue references
	/\b[A-Z][a-z]+[A-Z]\w*/, // CamelCase symbols like MyComponent
	/\b[a-z][a-z0-9_]*_[a-z0-9_]+\b/, // snake_case symbols like my_function
	/^\s*\d+\.\s/m, // numbered steps like "1. "
	/\b(acceptance|criteria|must|should)\b/i, // requirement language
	/\b(error|exception|traceback|E\d+)\b/i, // error/traceback signals
	/```/, // fenced code block
];

/** Prefix patterns that bypass the vagueness gate. */
const BYPASS_PREFIXES: RegExp[] = [/^force:\s*/i, /^!\s*/];

export interface SpecificityResult {
	specific: boolean;
	reason?: string;
}

export interface VaguenessRedirect {
	redirect: boolean;
	message?: string;
}

/**
 * Classify prompt specificity. A prompt is specific if it contains at least
 * one concrete signal OR has more words than the threshold. A short prompt
 * without concrete signals is classified as vague.
 */
export function classifyPromptSpecificity(prompt: string): SpecificityResult {
	// Strip skill-invocation prefix and force/! bypass prefix
	let effective = prompt.trim();
	for (const bypass of BYPASS_PREFIXES) {
		effective = effective.replace(bypass, "");
	}
	// Strip skill name tokens (team, ultragoal) and any /skill: prefix
	effective = effective.replace(/^(team|ultragoal)\s+/i, "");
	effective = effective.replace(/^\/?(skill|pi):/i, "");

	// Check for force/! bypass in original prompt
	for (const bypass of BYPASS_PREFIXES) {
		if (bypass.test(prompt.trim())) {
			return { specific: true, reason: "bypass prefix" };
		}
	}

	// Check for concrete signals
	for (const pattern of CONCRETE_SIGNAL_PATTERNS) {
		if (pattern.test(effective)) {
			return { specific: true, reason: "concrete signal" };
		}
	}

	// Check word count
	const words = effective.split(/\s+/).filter(Boolean).length;
	if (words > VAGUENESS_WORD_COUNT_THRESHOLD) {
		return { specific: true, reason: "sufficient word count" };
	}

	return { specific: false, reason: `vague: ${words} words, no concrete signals` };
}

/**
 * Check whether a team/ultragoal prompt should be redirected to ralplan
 * because it's too vague for direct execution.
 *
 * Returns { redirect: false } for specific prompts (pass through).
 * Returns { redirect: true, message } for vague prompts (redirect to ralplan).
 */
export function maybeRedirectVagueExecution(skill: "team" | "ultragoal", prompt: string): VaguenessRedirect {
	// Only gate team/ultragoal
	if (skill !== "team" && skill !== "ultragoal") {
		return { redirect: false };
	}

	const classification = classifyPromptSpecificity(prompt);
	if (classification.specific) {
		return { redirect: false };
	}

	return {
		redirect: true,
		message:
			`The prompt for ${skill} is too vague for direct execution (${classification.reason}). ` +
			`Use ralplan to produce a concrete plan first, then dispatch ${skill} with specific tasks. ` +
			`Tip: include file paths, symbols, numbered steps, acceptance criteria, or error details to pass the specificity gate. ` +
			`Prefix with "force:" or "!" to bypass this check.`,
	};
}
