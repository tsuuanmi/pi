/**
 * Default themes for TUI tests using chalk
 */

import { Chalk } from "chalk";
import {
	type EditorTheme,
	type MarkdownTheme,
	type SelectListTheme,
	setRegisteredThemes,
	Theme,
	type ThemeBg,
	type ThemeColor,
} from "#tui/index";

const chalk = new Chalk({ level: 3 });

const testThemeColors: ThemeColor[] = [
	"accent",
	"border",
	"borderAccent",
	"borderMuted",
	"success",
	"error",
	"warning",
	"muted",
	"dim",
	"text",
	"thinkingText",
	"userMessageText",
	"customMessageText",
	"customMessageLabel",
	"toolTitle",
	"toolOutput",
	"mdHeading",
	"mdLink",
	"mdLinkUrl",
	"mdCode",
	"mdCodeBlock",
	"mdCodeBlockBorder",
	"mdQuote",
	"mdQuoteBorder",
	"mdHr",
	"mdListBullet",
	"toolDiffAdded",
	"toolDiffRemoved",
	"toolDiffContext",
	"syntaxComment",
	"syntaxKeyword",
	"syntaxFunction",
	"syntaxVariable",
	"syntaxString",
	"syntaxNumber",
	"syntaxType",
	"syntaxOperator",
	"syntaxPunctuation",
	"thinkingOff",
	"thinkingMinimal",
	"thinkingLow",
	"thinkingMedium",
	"thinkingHigh",
	"thinkingXhigh",
	"bashMode",
];
const testThemeBackgrounds: ThemeBg[] = [
	"selectedBg",
	"userMessageBg",
	"customMessageBg",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
];

function createTestTheme(name: string): Theme {
	return new Theme(
		Object.fromEntries(testThemeColors.map((color) => [color, "#ffffff"])) as Record<ThemeColor, string>,
		Object.fromEntries(testThemeBackgrounds.map((color) => [color, "#000000"])) as Record<ThemeBg, string>,
		"truecolor",
		{ name },
	);
}

export function registerTestThemes(): void {
	setRegisteredThemes([createTestTheme("dark"), createTestTheme("light")]);
}

export const defaultSelectListTheme: SelectListTheme = {
	selectedPrefix: (text: string) => chalk.blue(text),
	selectedText: (text: string) => chalk.bold(text),
	description: (text: string) => chalk.dim(text),
	scrollInfo: (text: string) => chalk.dim(text),
	noMatch: (text: string) => chalk.dim(text),
};

export const defaultMarkdownTheme: MarkdownTheme = {
	heading: (text: string) => chalk.bold.cyan(text),
	link: (text: string) => chalk.blue(text),
	linkUrl: (text: string) => chalk.dim(text),
	code: (text: string) => chalk.yellow(text),
	codeBlock: (text: string) => chalk.green(text),
	codeBlockBorder: (text: string) => chalk.dim(text),
	quote: (text: string) => chalk.italic(text),
	quoteBorder: (text: string) => chalk.dim(text),
	hr: (text: string) => chalk.dim(text),
	listBullet: (text: string) => chalk.cyan(text),
	bold: (text: string) => chalk.bold(text),
	italic: (text: string) => chalk.italic(text),
	strikethrough: (text: string) => chalk.strikethrough(text),
	underline: (text: string) => chalk.underline(text),
};

export const defaultEditorTheme: EditorTheme = {
	borderColor: (text: string) => chalk.dim(text),
	selectList: defaultSelectListTheme,
};
