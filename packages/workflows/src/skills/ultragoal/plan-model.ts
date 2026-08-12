import type {
	UltragoalCompletionVerification,
	UltragoalGoal,
	UltragoalGoalStatus,
	UltragoalPlan,
} from "#workflows/skills/ultragoal/receipt";

const GOAL_DELIMITER = /^@goal(?::|[ \t]+|$)[ \t]*(.*)$/;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function normalizeGoalStatus(value: unknown): UltragoalGoalStatus {
	return value === "pending" ||
		value === "active" ||
		value === "complete" ||
		value === "failed" ||
		value === "blocked" ||
		value === "review_blocked" ||
		value === "superseded"
		? value
		: "pending";
}

export function parseGoalStatus(value: string): UltragoalGoalStatus {
	const status = normalizeGoalStatus(value);
	if (status === "pending" && value !== "pending") throw new Error(`invalid ultragoal status: ${value}`);
	return status;
}

export function firstNonEmptyLine(text: string): string | undefined {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

export function clampTitle(title: string): string {
	return title.length > 80 ? `${title.slice(0, 77)}...` : title;
}

export function parseGoalsFromBrief(brief: string): Array<{ title: string; objective: string }> {
	const sections: Array<{ title: string; body: string[] }> = [];
	let current: { title: string; body: string[] } | undefined;
	for (const line of brief.split(/\r?\n/)) {
		const match = GOAL_DELIMITER.exec(line);
		if (match) {
			current = { title: match[1].trim(), body: [] };
			sections.push(current);
			continue;
		}
		current?.body.push(line);
	}
	if (sections.length === 0) {
		const title = firstNonEmptyLine(brief) ?? "Complete approved goal";
		return [{ title: clampTitle(title), objective: brief.trim() }];
	}
	return sections.map((section, index) => {
		const body = section.body.join("\n").trim();
		const title = section.title || firstNonEmptyLine(body) || "";
		if (!title && !body) throw new Error(`ultragoal @goal block ${index + 1} has no title or objective`);
		return { title: clampTitle(title), objective: body || title };
	});
}

function normalizeSteering(value: unknown): UltragoalGoal["steering"] | undefined {
	if (!isPlainObject(value)) return undefined;
	const kind = typeof value.kind === "string" ? value.kind : undefined;
	if (!kind) return undefined;
	return { kind, blockedGoalId: typeof value.blockedGoalId === "string" ? value.blockedGoalId : undefined };
}

export function normalizePlan(raw: unknown): UltragoalPlan {
	if (!isPlainObject(raw)) throw new Error("Invalid ultragoal plan: expected object");
	const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowIso();
	const goals = Array.isArray(raw.goals) ? raw.goals : [];
	const mainGoal = isPlainObject(raw.mainGoal)
		? {
				id: typeof raw.mainGoal.id === "string" ? raw.mainGoal.id : "MAIN",
				title: typeof raw.mainGoal.title === "string" ? raw.mainGoal.title : "Complete approved goal",
				objective: typeof raw.mainGoal.objective === "string" ? raw.mainGoal.objective : "Complete approved goal",
				createdAt: typeof raw.mainGoal.createdAt === "string" ? raw.mainGoal.createdAt : createdAt,
				updatedAt: typeof raw.mainGoal.updatedAt === "string" ? raw.mainGoal.updatedAt : createdAt,
			}
		: undefined;
	return {
		version: 1,
		brief: typeof raw.brief === "string" ? raw.brief : "",
		mainGoal,
		goalMode: raw.goalMode === "per-story" ? "per-story" : "aggregate",
		objective: typeof raw.objective === "string" ? raw.objective : "Complete all approved goals with verification",
		objectiveAliases: Array.isArray(raw.objectiveAliases)
			? raw.objectiveAliases.filter((alias): alias is string => typeof alias === "string")
			: undefined,
		goals: goals.map((item, index): UltragoalGoal => {
			const record = isPlainObject(item) ? item : {};
			const goalCreatedAt = typeof record.createdAt === "string" ? record.createdAt : createdAt;
			return {
				id: typeof record.id === "string" ? record.id : `G${String(index + 1).padStart(3, "0")}`,
				title: typeof record.title === "string" ? record.title : `Goal ${index + 1}`,
				objective:
					typeof record.objective === "string"
						? record.objective
						: typeof record.title === "string"
							? record.title
							: `Goal ${index + 1}`,
				status: normalizeGoalStatus(record.status),
				createdAt: goalCreatedAt,
				updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : goalCreatedAt,
				parentGoalId: typeof record.parentGoalId === "string" ? record.parentGoalId : undefined,
				sequence:
					typeof record.sequence === "number" && Number.isFinite(record.sequence) ? record.sequence : undefined,
				startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
				completedAt: typeof record.completedAt === "string" ? record.completedAt : undefined,
				evidence: typeof record.evidence === "string" ? record.evidence : undefined,
				steering: normalizeSteering(record.steering),
				completionVerification: isPlainObject(record.completionVerification)
					? (record.completionVerification as unknown as UltragoalCompletionVerification)
					: undefined,
			};
		}),
		createdAt,
		updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
	};
}
