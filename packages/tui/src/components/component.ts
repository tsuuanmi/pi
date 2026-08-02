/** Base contract for renderable terminal components. */
export interface Component {
	/** Render the component within the supplied terminal width. */
	render(width: number): string[];

	/** Handle keyboard input when the component has focus. */
	handleInput?(data: string): void;

	/** Receive Kitty key-release events instead of only key presses. */
	wantsKeyRelease?: boolean;

	/** Clear cached rendering state. */
	invalidate(): void;

	/** Release timers, requests, and listeners when the component is removed. */
	dispose?(): void;
}

/** Component contract for hardware-cursor and IME support. */
export interface Focusable {
	focused: boolean;
}

export function isFocusable(component: Component | null): component is Component & Focusable {
	return component !== null && "focused" in component;
}

/** Zero-width marker emitted at a focused component's hardware-cursor position. */
export const CURSOR_MARKER = "\x1b_pi:c\x07";

/** A component that renders its children in order. */
export class Container implements Component {
	children: Component[] = [];

	addChild(component: Component): void {
		this.children.push(component);
	}

	removeChild(component: Component): void {
		const index = this.children.indexOf(component);
		if (index === -1) return;
		this.children.splice(index, 1);
		component.dispose?.();
	}

	clear(): void {
		const children = this.children;
		this.children = [];
		for (const child of children) child.dispose?.();
	}

	dispose(): void {
		this.clear();
	}

	invalidate(): void {
		for (const child of this.children) child.invalidate();
	}

	render(width: number): string[] {
		const lines: string[] = [];
		for (const child of this.children) lines.push(...child.render(width));
		return lines;
	}
}
