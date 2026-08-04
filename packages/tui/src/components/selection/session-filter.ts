import { fuzzyMatch } from "#tui/editor/completion/fuzzy";

export type SessionSortMode = "recent" | "relevance";

export type SessionNameFilter = "all" | "named";

export interface SearchableSessionInfo {
	id: string;
	name?: string | undefined;
	allMessagesText: string;
	cwd: string;
	modified: Date;
}

export interface ParsedSessionSearchQuery {
	mode: "tokens" | "regex";
	tokens: { kind: "fuzzy" | "phrase"; value: string }[];
	regex: RegExp | null;
	/** If set, parsing failed and the query should be treated as non-matching. */
	error?: string;
}

export interface SessionSearchMatchResult {
	matches: boolean;
	/** Lower is better; only meaningful when matches === true. */
	score: number;
}

function normalizeWhitespaceLower(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function getSessionSearchText(session: SearchableSessionInfo): string {
	return `${session.id} ${session.name ?? ""} ${session.allMessagesText} ${session.cwd}`;
}

export function hasSearchableSessionName(session: SearchableSessionInfo): boolean {
	return Boolean(session.name?.trim());
}

function matchesNameFilter(session: SearchableSessionInfo, filter: SessionNameFilter): boolean {
	if (filter === "all") return true;
	return hasSearchableSessionName(session);
}

function parseSessionSearchQuery(query: string): ParsedSessionSearchQuery {
	const trimmed = query.trim();
	if (!trimmed) {
		return { mode: "tokens", tokens: [], regex: null };
	}

	if (trimmed.startsWith("re:")) {
		const pattern = trimmed.slice(3).trim();
		if (!pattern) {
			return { mode: "regex", tokens: [], regex: null, error: "Empty regex" };
		}
		try {
			return { mode: "regex", tokens: [], regex: new RegExp(pattern, "i") };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { mode: "regex", tokens: [], regex: null, error: msg };
		}
	}

	const tokens: { kind: "fuzzy" | "phrase"; value: string }[] = [];
	let buf = "";
	let inQuote = false;
	let hadUnclosedQuote = false;

	const flush = (kind: "fuzzy" | "phrase"): void => {
		const value = buf.trim();
		buf = "";
		if (!value) return;
		tokens.push({ kind, value });
	};

	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i]!;
		if (ch === '"') {
			if (inQuote) {
				flush("phrase");
				inQuote = false;
			} else {
				flush("fuzzy");
				inQuote = true;
			}
			continue;
		}

		if (!inQuote && /\s/.test(ch)) {
			flush("fuzzy");
			continue;
		}

		buf += ch;
	}

	if (inQuote) {
		hadUnclosedQuote = true;
	}

	if (hadUnclosedQuote) {
		return {
			mode: "tokens",
			tokens: trimmed
				.split(/\s+/)
				.map((token) => token.trim())
				.filter((token) => token.length > 0)
				.map((token) => ({ kind: "fuzzy" as const, value: token })),
			regex: null,
		};
	}

	flush(inQuote ? "phrase" : "fuzzy");

	return { mode: "tokens", tokens, regex: null };
}

function matchSession(session: SearchableSessionInfo, parsed: ParsedSessionSearchQuery): SessionSearchMatchResult {
	const text = getSessionSearchText(session);

	if (parsed.mode === "regex") {
		if (!parsed.regex) {
			return { matches: false, score: 0 };
		}
		const idx = text.search(parsed.regex);
		if (idx < 0) return { matches: false, score: 0 };
		return { matches: true, score: idx * 0.1 };
	}

	if (parsed.tokens.length === 0) {
		return { matches: true, score: 0 };
	}

	let totalScore = 0;
	let normalizedText: string | null = null;

	for (const token of parsed.tokens) {
		if (token.kind === "phrase") {
			if (normalizedText === null) {
				normalizedText = normalizeWhitespaceLower(text);
			}
			const phrase = normalizeWhitespaceLower(token.value);
			if (!phrase) continue;
			const idx = normalizedText.indexOf(phrase);
			if (idx < 0) return { matches: false, score: 0 };
			totalScore += idx * 0.1;
			continue;
		}

		const match = fuzzyMatch(token.value, text);
		if (!match.matches) return { matches: false, score: 0 };
		totalScore += match.score;
	}

	return { matches: true, score: totalScore };
}

export function filterAndSortSearchableSessions<T extends SearchableSessionInfo>(
	sessions: T[],
	query: string,
	sortMode: SessionSortMode,
	nameFilter: SessionNameFilter = "all",
): T[] {
	const nameFiltered =
		nameFilter === "all" ? sessions : sessions.filter((session) => matchesNameFilter(session, nameFilter));
	const trimmed = query.trim();
	if (!trimmed) return nameFiltered;

	const parsed = parseSessionSearchQuery(query);
	if (parsed.error) return [];

	if (sortMode === "recent") {
		const filtered: T[] = [];
		for (const session of nameFiltered) {
			const result = matchSession(session, parsed);
			if (result.matches) filtered.push(session);
		}
		return filtered;
	}

	const scored: { session: T; score: number }[] = [];
	for (const session of nameFiltered) {
		const result = matchSession(session, parsed);
		if (!result.matches) continue;
		scored.push({ session, score: result.score });
	}

	scored.sort((a, b) => {
		if (a.score !== b.score) return a.score - b.score;
		return b.session.modified.getTime() - a.session.modified.getTime();
	});

	return scored.map((result) => result.session);
}
