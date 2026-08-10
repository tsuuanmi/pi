/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { Locator } from "playwright";
import type { MarkdownSegment } from "./markdown.ts";
import { COPY_BUTTON } from "./selectors.ts";
import { isTraceControl, type TraceBlock } from "./trace.ts";

export interface ResponseSnapshot {
	responsePresent: boolean;
	visibleText: string;
	fullHtml: string;
	markdownSegments: MarkdownSegment[];
	completionActionVisible: boolean;
	traceBlocks: TraceBlock[];
}

export const absentResponse = (): ResponseSnapshot => ({
	responsePresent: false,
	visibleText: "",
	fullHtml: "",
	markdownSegments: [],
	completionActionVisible: false,
	traceBlocks: [],
});

export async function responseSnapshot(response: Locator): Promise<ResponseSnapshot> {
	if ((await response.count()) === 0) return absentResponse();
	const snapshot = await response.evaluate(
		(element, completionSelector) => {
			const root = element as HTMLElement;
			const visible = (candidate: HTMLElement): boolean => {
				const style = getComputedStyle(candidate);
				const rect = candidate.getBoundingClientRect();
				return (
					style.display !== "none" &&
					style.visibility !== "hidden" &&
					style.opacity !== "0" &&
					rect.width > 0 &&
					rect.height > 0
				);
			};

			const markdownRoots = [...root.querySelectorAll<HTMLElement>(".markdown")]
				.filter((candidate) => !candidate.parentElement?.closest(".markdown"))
				.filter(visible);
			const commentaryRoots = markdownRoots.filter(
				(candidate) => candidate.closest("[data-streaming-response-status]") !== null,
			);
			const answerRoots = markdownRoots.filter(
				(candidate) => candidate.closest("[data-streaming-response-status]") === null,
			);
			const markdownSegments: MarkdownSegment[] = answerRoots.flatMap((markdownRoot, rootIndex) => {
				const rootComplete = rootIndex < answerRoots.length - 1;
				const directText = [...markdownRoot.childNodes].some(
					(node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
				);
				const children = [...markdownRoot.children] as HTMLElement[];
				if (directText || children.length === 0) {
					return markdownRoot.innerHTML.trim()
						? [
								{
									key: `${rootIndex}:root`,
									html: markdownRoot.innerHTML,
									text: markdownRoot.innerText.trim(),
									streamable: rootComplete,
								},
							]
						: [];
				}

				return children.flatMap((child, childIndex) => {
					const tag = child.tagName.toLowerCase();
					const childComplete = rootComplete || childIndex < children.length - 1;
					const items =
						tag === "ol" || tag === "ul"
							? ([...child.children].filter((candidate) => candidate.tagName === "LI") as HTMLElement[])
							: [];
					if (items.length === 0) {
						return [
							{
								key: `${rootIndex}:${childIndex}:${tag}`,
								html: child.outerHTML,
								text: child.innerText.trim(),
								streamable: childComplete,
							},
						];
					}

					const group = `${rootIndex}:${childIndex}:${tag}`;
					const start = tag === "ol" ? Number(child.getAttribute("start") ?? "1") : undefined;
					return items.map((item, itemIndex) => {
						const shell = child.cloneNode(false) as HTMLElement;
						shell.removeAttribute("data-is-last-node");
						if (start !== undefined && Number.isFinite(start))
							shell.setAttribute("start", String(start + itemIndex));
						shell.append(item.cloneNode(true));
						return {
							key: `${rootIndex}:${childIndex}:${tag}:${itemIndex}`,
							html: shell.outerHTML,
							text: item.innerText.trim(),
							group,
							streamable: childComplete || itemIndex < items.length - 1,
						};
					});
				});
			});

			const rendered = answerRoots.at(-1);
			const completionActions = [...root.querySelectorAll<HTMLElement>(completionSelector)].filter(visible);
			const completionAction = rendered
				? completionActions.find(
						(candidate) =>
							!rendered.contains(candidate) &&
							Boolean(rendered.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING),
					)
				: completionActions.at(-1);
			const completionControls = new Set(completionAction ? [completionAction] : []);
			const candidates = new Map<HTMLElement, TraceBlock["kind"]>();
			answerRoots.forEach((candidate) => {
				candidates.set(candidate, "answer");
			});
			commentaryRoots.forEach((candidate) => {
				candidates.set(candidate, "commentary");
			});
			const overlapsAnswer = (candidate: HTMLElement): boolean =>
				answerRoots.some((answer) => candidate.contains(answer) || answer.contains(candidate));
			const overlapsCommentary = (candidate: HTMLElement): boolean =>
				commentaryRoots.some((commentary) => candidate.contains(commentary) || commentary.contains(candidate));
			const semantic = (candidate: HTMLElement): HTMLElement =>
				candidate.closest<HTMLElement>("button") ?? candidate;
			const traceText = (candidate: HTMLElement): string => {
				const ariaLabel = candidate.getAttribute("aria-label")?.trim();
				if (ariaLabel) return ariaLabel;
				const screenReaderText = [...candidate.querySelectorAll<HTMLElement>(".sr-only")]
					.map((part) => part.textContent?.replace(/\s+/g, " ").trim() ?? "")
					.find(Boolean);
				return screenReaderText || candidate.innerText.trim();
			};
			const traceKey = (candidate: HTMLElement, kind: TraceBlock["kind"]): string | undefined => {
				const status = candidate.closest<HTMLElement>("[data-streaming-response-status]");
				const anchor = candidate.closest<HTMLElement>("[data-item-anchor]");
				if (!status || !anchor) return undefined;
				const index = [...status.querySelectorAll<HTMLElement>("[data-item-anchor]")].indexOf(anchor);
				return index >= 0 ? `${kind}:anchor:${index}` : undefined;
			};

			root
				.querySelectorAll<HTMLElement>(
					'button, [role="status"], [aria-busy="true"], [data-testid*="cot"], [data-testid*="reason"], [data-testid*="thought"]',
				)
				.forEach((candidate) => {
					if (completionControls.has(candidate) || overlapsAnswer(candidate) || overlapsCommentary(candidate))
						return;
					const target = semantic(candidate);
					if (!overlapsAnswer(target) && !overlapsCommentary(target) && !candidates.has(target)) {
						candidates.set(target, "status");
					}
				});
			root.querySelectorAll<HTMLElement>("[data-streaming-response-status]").forEach((container) => {
				if (
					!overlapsAnswer(container) &&
					!overlapsCommentary(container) &&
					![...candidates.keys()].some((candidate) => container.contains(candidate))
				) {
					candidates.set(container, "status");
				}
			});

			const traceByKey = new Map<string, TraceBlock>();
			[...candidates]
				.filter(([candidate]) => visible(candidate))
				.sort(([left], [right]) =>
					left === right ? 0 : left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
				)
				.map(([candidate, kind]) => ({
					kind,
					text: traceText(candidate),
					key: traceKey(candidate, kind),
					uiControl: candidate.matches("button") && candidate.closest("[data-streaming-response-status]") === null,
				}))
				.filter((block) => block.text.length > 0)
				.forEach((block, index) => {
					const key = block.key ?? `${block.kind}:index:${index}`;
					const previous = traceByKey.get(key);
					if (!previous || block.text.length > previous.text.length) traceByKey.set(key, block);
				});
			const traceBlocks = [...traceByKey.values()].map((block, index, blocks) => ({
				...block,
				...(block.kind === "commentary" ? { complete: index < blocks.length - 1 } : {}),
			}));

			return {
				responsePresent: true,
				visibleText: answerRoots
					.map((candidate) => candidate.innerText.trim())
					.filter(Boolean)
					.join("\n\n"),
				fullHtml: answerRoots.map((candidate) => candidate.innerHTML).join(""),
				markdownSegments,
				completionActionVisible: completionAction !== undefined,
				traceBlocks,
			};
		},
		COPY_BUTTON,
		{ timeout: 2_000 },
	);
	return { ...snapshot, traceBlocks: snapshot.traceBlocks.filter((block) => !isTraceControl(block)) };
}
