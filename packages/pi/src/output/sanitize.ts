/**
 * Sanitize binary output for display and storage.
 * Removes control, format, and invalid characters that can break terminal rendering.
 */
export function sanitizeBinaryOutput(value: string): string {
	return Array.from(value)
		.filter((character) => {
			const codePoint = character.codePointAt(0);
			if (codePoint === undefined) return false;
			if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return true;
			if (codePoint <= 0x1f) return false;
			if (codePoint >= 0xfff9 && codePoint <= 0xfffb) return false;
			return true;
		})
		.join("");
}
