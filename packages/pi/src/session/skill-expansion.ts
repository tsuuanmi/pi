import { readFileSync } from "node:fs";
import type { AgentSessionContext } from "#pi/session/agent-session-context";
import { stripFrontmatter } from "#pi/utils/fs/index";

/**
 * Phase-1 SkillExpansion subsystem (stateless module function on
 * `AgentSessionContext`). Extracted verbatim from `AgentSession._expandSkillCommand`
 * (`agent-session.ts:1204`); the private method on `AgentSession` now delegates
 * here. Pure structural / zero behavior change.
 *
 * `parseSkillBlock` is intentionally NOT imported: it is a public SDK export
 * that stays in `agent-session.ts`, and `_expandSkillCommand` does not use it.
 */
export function expandSkillCommand(text: string, ctx: AgentSessionContext): string {
	if (!text.startsWith("/skill:")) return text;

	const spaceIndex = text.indexOf(" ");
	const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
	const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();

	const skill = ctx.resourceLoader.getSkills().skills.find((s) => s.name === skillName);
	if (!skill) return text; // Unknown skill, pass through

	try {
		const content = readFileSync(skill.filePath, "utf-8");
		const body = stripFrontmatter(content).trim();
		const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
		return args ? `${skillBlock}\n\n${args}` : skillBlock;
	} catch (err) {
		// Emit error like extension commands do
		ctx.emitError({
			extensionPath: skill.filePath,
			event: "skill_expansion",
			error: err instanceof Error ? err.message : String(err),
		});
		return text; // Return original on error
	}
}
