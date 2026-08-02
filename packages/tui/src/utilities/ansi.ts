/*
 * Portions of this file are derived from:
 * - ansi-regex (https://github.com/chalk/ansi-regex)
 * - strip-ansi (https://github.com/chalk/strip-ansi)
 *
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const ESC = 0x1b;
const BEL = 0x07;
const C1_CSI = 0x9b;
const C1_STRING_STARTS = new Set([0x90, 0x98, 0x9d, 0x9e, 0x9f]);
const STRING_ESCAPED_STARTS = new Set(["P", "X", "]", "^", "_"]);

export interface AnsiSequence {
	code: string;
	length: number;
}

function isCsiFinal(code: number): boolean {
	return code >= 0x40 && code <= 0x7e;
}

function consumeCsi(value: string, start: number, payloadStart: number): AnsiSequence | undefined {
	for (let index = payloadStart; index < value.length; index += 1) {
		if (isCsiFinal(value.charCodeAt(index))) {
			return {
				code: value.slice(start, index + 1),
				length: index + 1 - start,
			};
		}
	}
	return undefined;
}

function consumeString(value: string, start: number, payloadStart: number): AnsiSequence | undefined {
	for (let index = payloadStart; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code === BEL || code === 0x9c) {
			return {
				code: value.slice(start, index + 1),
				length: index + 1 - start,
			};
		}
		if (code === ESC && value.charCodeAt(index + 1) === 0x5c) {
			return {
				code: value.slice(start, index + 2),
				length: index + 2 - start,
			};
		}
	}
	return undefined;
}

/** Read one complete ANSI control sequence beginning at `start`. */
export function consumeAnsiSequence(value: string, start: number): AnsiSequence | undefined {
	if (start < 0 || start >= value.length) return undefined;

	const first = value.charCodeAt(start);
	if (first === C1_CSI) {
		return consumeCsi(value, start, start + 1);
	}
	if (C1_STRING_STARTS.has(first)) {
		return consumeString(value, start, start + 1);
	}
	if (first !== ESC) return undefined;

	if (start + 1 >= value.length) return undefined;
	const second = value[start + 1];
	if (second === "[") {
		return consumeCsi(value, start, start + 2);
	}
	if (second !== undefined && STRING_ESCAPED_STARTS.has(second)) {
		return consumeString(value, start, start + 2);
	}
	if (second === "O") {
		return start + 2 < value.length ? { code: value.slice(start, start + 3), length: 3 } : undefined;
	}

	// Two-byte ESC sequences (for example charset selection and Meta keys).
	return { code: value.slice(start, start + 2), length: 2 };
}

export function stripAnsi(value: string): string {
	if (typeof value !== "string") {
		throw new TypeError(`Expected a \`string\`, got \`${typeof value}\``);
	}

	let result = "";
	let index = 0;
	while (index < value.length) {
		const sequence = consumeAnsiSequence(value, index);
		if (sequence) {
			index += sequence.length;
			continue;
		}
		result += value[index];
		index += 1;
	}
	return result;
}
