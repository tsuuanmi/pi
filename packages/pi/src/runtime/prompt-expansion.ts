import type { PromptTemplate } from "#pi/loader/prompt-templates";

/**
 * Parse command arguments respecting quoted strings (bash-style).
 */
export function parseCommandArgs(argsString: string): string[] {
	const args: string[] = [];
	let current = "";
	let inQuote: string | null = null;

	for (let i = 0; i < argsString.length; i++) {
		const char = argsString[i];

		if (inQuote) {
			if (char === inQuote) {
				inQuote = null;
			} else {
				current += char;
			}
		} else if (char === '"' || char === "'") {
			inQuote = char;
		} else if (/\s/.test(char)) {
			if (current) {
				args.push(current);
				current = "";
			}
		} else {
			current += char;
		}
	}

	if (current) {
		args.push(current);
	}

	return args;
}

/**
 * Substitute argument placeholders in template content.
 */
export function substituteArgs(content: string, args: string[]): string {
	const allArgs = args.join(" ");

	return content.replace(
		/\$\{(\d+):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
		(_match, defaultNum, defaultValue, sliceStart, sliceLength, simple) => {
			if (defaultNum) {
				const index = parseInt(defaultNum, 10) - 1;
				const value = args[index];
				return value ? value : defaultValue;
			}

			if (sliceStart) {
				let start = parseInt(sliceStart, 10) - 1;
				if (start < 0) start = 0;

				if (sliceLength) {
					const length = parseInt(sliceLength, 10);
					return args.slice(start, start + length).join(" ");
				}
				return args.slice(start).join(" ");
			}

			if (simple === "ARGUMENTS" || simple === "@") {
				return allArgs;
			}

			const index = parseInt(simple, 10) - 1;
			return args[index] ?? "";
		},
	);
}

/**
 * Expand a prompt template if it matches a template name.
 */
export function expandPromptTemplate(text: string, templates: PromptTemplate[]): string {
	if (!text.startsWith("/")) return text;

	const match = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
	if (!match) return text;

	const templateName = match[1];
	const argsString = match[2] ?? "";
	const template = templates.find((item) => item.name === templateName);
	if (!template) return text;

	return substituteArgs(template.content, parseCommandArgs(argsString));
}
