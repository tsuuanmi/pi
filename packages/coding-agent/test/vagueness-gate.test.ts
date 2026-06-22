import { describe, expect, it } from "vitest";
import {
	classifyPromptSpecificity,
	maybeRedirectVagueExecution,
	VAGUENESS_WORD_COUNT_THRESHOLD,
} from "../src/workflows/ralplan/vagueness-gate.ts";

describe("vagueness-gate", () => {
	describe("classifyPromptSpecificity", () => {
		it("passes prompts with a file path", () => {
			const result = classifyPromptSpecificity("Fix the bug in src/utils/paths.ts");
			expect(result.specific).toBe(true);
			expect(result.reason).toBe("concrete signal");
		});

		it("passes prompts with a CamelCase symbol", () => {
			const result = classifyPromptSpecificity("Refactor MyComponent to use hooks");
			expect(result.specific).toBe(true);
			expect(result.reason).toBe("concrete signal");
		});

		it("passes prompts with a snake_case symbol", () => {
			const result = classifyPromptSpecificity("Update my_function to handle errors");
			expect(result.specific).toBe(true);
			expect(result.reason).toBe("concrete signal");
		});

		it("passes prompts with numbered steps", () => {
			const result = classifyPromptSpecificity("1. Fix the bug\n2. Add a test\n3. Update docs");
			expect(result.specific).toBe(true);
			expect(result.reason).toBe("concrete signal");
		});

		it("passes prompts with acceptance criteria language", () => {
			const result = classifyPromptSpecificity("The system must validate all inputs before processing");
			expect(result.specific).toBe(true);
			expect(result.reason).toBe("concrete signal");
		});

		it("passes prompts with error/traceback signals", () => {
			const result = classifyPromptSpecificity("Fix the TypeError: Cannot read property 'id' of undefined");
			expect(result.specific).toBe(true);
		});

		it("passes prompts with issue numbers", () => {
			const result = classifyPromptSpecificity("Implement #123: Add user authentication");
			expect(result.specific).toBe(true);
		});

		it("passes prompts with fenced code blocks", () => {
			const result = classifyPromptSpecificity("Fix this:\n```\nconsole.log('hello')\n```");
			expect(result.specific).toBe(true);
		});

		it("passes long-vague prompts (above threshold)", () => {
			const words = Array(VAGUENESS_WORD_COUNT_THRESHOLD + 2)
				.fill("word")
				.join(" ");
			const result = classifyPromptSpecificity(words);
			expect(result.specific).toBe(true);
			expect(result.reason).toBe("sufficient word count");
		});

		it("gates short-vague prompts", () => {
			const result = classifyPromptSpecificity("Build the thing");
			expect(result.specific).toBe(false);
		});

		it("passes force: prefix", () => {
			const result = classifyPromptSpecificity("force: Build the thing");
			expect(result.specific).toBe(true);
			expect(result.reason).toBe("bypass prefix");
		});

		it("passes ! prefix", () => {
			const result = classifyPromptSpecificity("! Build the thing");
			expect(result.specific).toBe(true);
			expect(result.reason).toBe("bypass prefix");
		});

		it("strips skill-invocation prefix before classification", () => {
			const result = classifyPromptSpecificity("team Build the thing");
			expect(result.specific).toBe(false);
		});

		it("strips /skill: prefix before classification", () => {
			const result = classifyPromptSpecificity("/skill: ultragoal Fix bug in src/main.ts");
			expect(result.specific).toBe(true);
		});
	});

	describe("maybeRedirectVagueExecution", () => {
		it("redirects vague team prompts", () => {
			const result = maybeRedirectVagueExecution("team", "Build it");
			expect(result.redirect).toBe(true);
			expect(result.message).toContain("ralplan");
		});

		it("redirects vague ultragoal prompts", () => {
			const result = maybeRedirectVagueExecution("ultragoal", "Do the work");
			expect(result.redirect).toBe(true);
		});

		it("passes specific team prompts", () => {
			const result = maybeRedirectVagueExecution("team", "Implement auth in src/auth.ts with JWT tokens");
			expect(result.redirect).toBe(false);
		});

		it("does not gate ralplan prompts", () => {
			const result = maybeRedirectVagueExecution("ralplan" as "team", "Build it");
			expect(result.redirect).toBe(false);
		});

		it("does not gate deep-interview prompts", () => {
			const result = maybeRedirectVagueExecution("deep-interview" as "team", "Ask about the project");
			expect(result.redirect).toBe(false);
		});
	});

	describe("VAGUENESS_WORD_COUNT_THRESHOLD", () => {
		it("is a named constant with the expected value", () => {
			expect(VAGUENESS_WORD_COUNT_THRESHOLD).toBe(15);
		});
	});
});
