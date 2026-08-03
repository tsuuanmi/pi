import { describe, expect, test } from "vitest";
import { buildSystemPrompt, formatSkillsForPrompt } from "#pi/agent/system-prompt";
import type { Skill } from "#pi/loader/skill";
import { createSyntheticSourceInfo } from "#pi/package-manager/source-info";

function createTestSkill(options: {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	disableModelInvocation?: boolean;
	source?: string;
}): Skill {
	return {
		name: options.name,
		description: options.description,
		filePath: options.filePath,
		baseDir: options.baseDir,
		sourceInfo: createSyntheticSourceInfo(options.filePath, { source: options.source ?? "test" }),
		disableModelInvocation: options.disableModelInvocation ?? false,
	};
}

describe("formatSkillsForPrompt", () => {
	test("returns empty string for no skills", () => {
		const result = formatSkillsForPrompt([]);
		expect(result).toBe("");
	});

	test("formats skills as XML", () => {
		const skills: Skill[] = [
			createTestSkill({
				name: "test-skill",
				description: "A test skill.",
				filePath: "/path/to/skill/SKILL.md",
				baseDir: "/path/to/skill",
			}),
		];

		const result = formatSkillsForPrompt(skills);

		expect(result).toContain("<available_skills>");
		expect(result).toContain("</available_skills>");
		expect(result).toContain("<skill>");
		expect(result).toContain("<name>test-skill</name>");
		expect(result).toContain("<description>A test skill.</description>");
		expect(result).toContain("<location>/path/to/skill/SKILL.md</location>");
	});

	test("includes intro text before XML", () => {
		const skills: Skill[] = [
			createTestSkill({
				name: "test-skill",
				description: "A test skill.",
				filePath: "/path/to/skill/SKILL.md",
				baseDir: "/path/to/skill",
			}),
		];

		const result = formatSkillsForPrompt(skills);
		const xmlStart = result.indexOf("<available_skills>");
		const introText = result.substring(0, xmlStart);

		expect(introText).toContain("The following skills provide specialized instructions");
		expect(introText).toContain("Use the read tool to load a skill's file");
	});

	test("escapes XML special characters", () => {
		const skills: Skill[] = [
			createTestSkill({
				name: "test-skill",
				description: 'A skill with <special> & "characters".',
				filePath: "/path/to/skill/SKILL.md",
				baseDir: "/path/to/skill",
			}),
		];

		const result = formatSkillsForPrompt(skills);

		expect(result).toContain("&lt;special&gt;");
		expect(result).toContain("&amp;");
		expect(result).toContain("&quot;characters&quot;");
	});

	test("formats multiple skills", () => {
		const skills: Skill[] = [
			createTestSkill({
				name: "skill-one",
				description: "First skill.",
				filePath: "/path/one/SKILL.md",
				baseDir: "/path/one",
			}),
			createTestSkill({
				name: "skill-two",
				description: "Second skill.",
				filePath: "/path/two/SKILL.md",
				baseDir: "/path/two",
			}),
		];

		const result = formatSkillsForPrompt(skills);

		expect(result).toContain("<name>skill-one</name>");
		expect(result).toContain("<name>skill-two</name>");
		expect((result.match(/<skill>/g) || []).length).toBe(2);
	});

	test("excludes skills with disableModelInvocation", () => {
		const skills: Skill[] = [
			createTestSkill({
				name: "visible-skill",
				description: "A visible skill.",
				filePath: "/path/visible/SKILL.md",
				baseDir: "/path/visible",
			}),
			createTestSkill({
				name: "hidden-skill",
				description: "A hidden skill.",
				filePath: "/path/hidden/SKILL.md",
				baseDir: "/path/hidden",
				disableModelInvocation: true,
			}),
		];

		const result = formatSkillsForPrompt(skills);

		expect(result).toContain("<name>visible-skill</name>");
		expect(result).not.toContain("<name>hidden-skill</name>");
		expect((result.match(/<skill>/g) || []).length).toBe(1);
	});

	test("returns empty string when all skills have disableModelInvocation", () => {
		const skills: Skill[] = [
			createTestSkill({
				name: "hidden-skill",
				description: "A hidden skill.",
				filePath: "/path/hidden/SKILL.md",
				baseDir: "/path/hidden",
				disableModelInvocation: true,
			}),
		];

		const result = formatSkillsForPrompt(skills);
		expect(result).toBe("");
	});
});

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Show file paths clearly");
		});
	});

	describe("default tools", () => {
		test("includes all default tools when snippets are provided", () => {
			const prompt = buildSystemPrompt({
				toolSnippets: {
					read: "Read file contents",
					bash: "Execute bash commands",
					edit: "Make surgical edits",
					write: "Create or overwrite files",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
		});

		test("instructs models to resolve pi docs under absolute base paths", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain(
				"- When reading pi docs, resolve docs/... under Additional docs, not the current working directory",
			);
		});
	});

	describe("custom tool snippets", () => {
		test("includes custom tools in available tools section when promptSnippet is provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				toolSnippets: {
					dynamic_tool: "Run dynamic test behavior",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- dynamic_tool: Run dynamic test behavior");
		});

		test("omits custom tools from available tools section when promptSnippet is not provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).not.toContain("dynamic_tool");
		});
	});

	describe("prompt guidelines", () => {
		test("appends promptGuidelines to default guidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for project summaries."],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- Use dynamic_tool for project summaries.");
		});

		test("deduplicates and trims promptGuidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for summaries.", "  Use dynamic_tool for summaries.  ", "   "],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt.match(/- Use dynamic_tool for summaries\./g)).toHaveLength(1);
		});
	});
});
