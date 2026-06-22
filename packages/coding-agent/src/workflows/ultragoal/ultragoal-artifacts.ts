/**
 * Structural artifact validation for ultragoal completion evidence (UG-006).
 *
 * Validates that quality-gate artifact references point to real, structurally
 * valid proof artifacts: screenshots (PNG/JPEG with decodable dimensions and
 * non-uniform imagery), automation transcripts (schema-versioned JSON with
 * monotonic timestamps), and PTY captures (terminal control sequences).
 *
 * Ports Gajae's structural-validation behavior with Pi-native field names and
 * Node-only I/O. Acyclic module graph: this module is a leaf. It imports only
 * `node:fs/promises`, `node:zlib`, and `shared/canonical-json.ts`. It MUST NOT
 * import `ultragoal-runtime.ts`, `ultragoal-quality-gate.ts`, or
 * `ultragoal-receipt.ts`.
 *
 * Portability: no `Bun.*` APIs. `node:fs/promises.readFile` + `node:zlib.inflateSync`
 * only. ENOENT is handled consistently with `state-writer.ts`'s
 * `readExistingStateForMutation`.
 */
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { inflateSync } from "node:zlib";

export type SurfaceFamily = "web" | "native" | "cli" | "unknown";

/**
 * Typed verified-receipt used by the cli-surface reduction: a cli surface row
 * may prove live execution with an existing non-empty artifact path OR a typed
 * `VerifiedReceipt` (no CLI replay/exempt machinery in this milestone).
 */
export interface VerifiedReceipt {
	verifiedAt: string;
	verifiedBy?: string;
	summary: string;
}

/** Minimum dimensions for an acceptable screenshot. */
const MIN_SCREENSHOT_WIDTH = 320;
const MIN_SCREENSHOT_HEIGHT = 180;
const MIN_SCREENSHOT_BYTES = 4096;
const MIN_PTY_BYTES = 512;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_START_OF_IMAGE = 0xd8;
const JPEG_END_OF_IMAGE = 0xd9;
const JPEG_START_OF_SCAN = 0xda;
const JPEG_STANDALONE_MARKERS = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);
// Gajae parity: only baseline (SOF0), extended (SOF1), and progressive (SOF2)
// frame markers carry dimensions; lossless/arithmetic variants are rejected.
const JPEG_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2]);

const PNG_CRC_TABLE = new Uint32Array(256).map((_, index) => {
	let crc = index;
	for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	return crc >>> 0;
});

function pngCrc32(bytes: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requiredStringField(row: Record<string, unknown>, key: string, fieldName: string): string {
	const value = row[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`qualityGate ${fieldName}.${key} must be a non-empty string`);
	}
	return value.trim();
}

function requireQualityGateObject(value: unknown, fieldName: string): Record<string, unknown> {
	if (!isPlainObject(value)) throw new Error(`qualityGate ${fieldName} must be an object`);
	return value;
}

function requireObjectArray(value: unknown, fieldName: string): Record<string, unknown>[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`qualityGate ${fieldName} must be a non-empty object array`);
	}
	return value.map((item, index) => requireQualityGateObject(item, `${fieldName}[${index}]`));
}

/** Resolve an artifact path under `cwd`. Returns null when the file is absent. */
async function readArtifactBytes(cwd: string, row: Record<string, unknown>, fieldName: string): Promise<Buffer | null> {
	const raw = nonEmptyString(row.path);
	if (!raw) return null;
	const resolved = isAbsolute(raw) ? raw : resolve(cwd, raw);
	try {
		const buffer = await readFile(resolved);
		return buffer;
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return null;
		throw new Error(`qualityGate ${fieldName} artifact could not be read: ${String(error)}`);
	}
}

/** Whether a referenced artifact path exists and is non-empty (stat, no full read). */
export async function hasExistingNonEmptyArtifact(cwd: string, path: unknown): Promise<boolean> {
	const resolved = nonEmptyString(path);
	if (!resolved) return false;
	const absolute = isAbsolute(resolved) ? resolved : resolve(cwd, resolved);
	try {
		const info = await stat(absolute);
		return info.size > 0;
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return false;
		throw error;
	}
}

function parsePngDimensions(
	bytes: Buffer,
): { width: number; height: number; headerBytes: number; sampleBytes?: Buffer } | null {
	if (bytes.length < 45) return null;
	if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
	let offset = 8;
	let width = 0;
	let height = 0;
	let sawIhdr = false;
	let sawIdat = false;
	const idatChunks: Buffer[] = [];
	while (offset + 12 <= bytes.length) {
		const chunkStart = offset;
		const length = bytes.readUInt32BE(offset);
		offset += 4;
		const type = bytes.toString("ascii", offset, offset + 4);
		offset += 4;
		if (offset + length + 4 > bytes.length) return null;
		const data = bytes.subarray(offset, offset + length);
		offset += length;
		const expectedCrc = bytes.readUInt32BE(offset);
		offset += 4;
		if (pngCrc32(bytes.subarray(chunkStart + 4, offset - 4)) !== expectedCrc) return null;
		if (!sawIhdr) {
			if (type !== "IHDR" || length !== 13) return null;
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			// Bit depth 8, color type 2 (RGB) or 6 (RGBA), standard compression/filter/interlace.
			if (
				width === 0 ||
				height === 0 ||
				data[8] !== 8 ||
				![2, 6].includes(data[9]!) ||
				data[10] !== 0 ||
				data[11] !== 0 ||
				data[12] !== 0
			)
				return null;
			sawIhdr = true;
		} else if (type === "IHDR") return null;
		if (type === "IDAT") {
			if (!sawIhdr || length === 0) return null;
			sawIdat = true;
			idatChunks.push(data);
		}
		if (type === "IEND") {
			if (length !== 0 || !sawIhdr || !sawIdat || offset !== bytes.length) return null;
			try {
				return { width, height, headerBytes: 8, sampleBytes: inflateSync(Buffer.concat(idatChunks)) };
			} catch {
				return null;
			}
		}
	}
	return null;
}

function parseJpegDimensions(
	bytes: Buffer,
): { width: number; height: number; headerBytes: number; sampleBytes?: Buffer } | null {
	if (bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== JPEG_START_OF_IMAGE) return null;
	let offset = 2;
	let dimensions: { width: number; height: number; headerBytes: number } | null = null;
	let sawStartOfScan = false;
	let scanStart = -1;
	while (offset < bytes.length) {
		if (bytes[offset] !== 0xff) return null;
		while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
		if (offset >= bytes.length) return null;
		const marker = bytes[offset];
		offset += 1;
		if (marker === 0x00) return null;
		if (marker === JPEG_END_OF_IMAGE) return null;
		if (JPEG_STANDALONE_MARKERS.has(marker)) continue;
		if (offset + 2 > bytes.length) return null;
		const segmentLength = bytes.readUInt16BE(offset);
		if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
		const segmentDataEnd = offset + segmentLength;
		if (JPEG_FRAME_MARKERS.has(marker)) {
			if (segmentLength < 8) return null;
			dimensions = {
				width: bytes.readUInt16BE(offset + 5),
				height: bytes.readUInt16BE(offset + 3),
				headerBytes: offset + segmentLength,
			};
		}
		if (marker === JPEG_START_OF_SCAN) {
			if (!dimensions || segmentDataEnd >= bytes.length) return null;
			sawStartOfScan = true;
			scanStart = segmentDataEnd;
			break;
		}
		offset += segmentLength;
	}
	if (!dimensions || !sawStartOfScan || scanStart < 0) return null;
	let scanOffset = scanStart;
	let entropyBytes = 0;
	while (scanOffset < bytes.length) {
		const byte = bytes[scanOffset];
		scanOffset += 1;
		if (byte !== 0xff) {
			entropyBytes += 1;
			continue;
		}
		if (scanOffset >= bytes.length) return null;
		const marker = bytes[scanOffset];
		scanOffset += 1;
		if (marker === 0x00) {
			entropyBytes += 1;
			continue;
		}
		if (JPEG_STANDALONE_MARKERS.has(marker)) continue;
		if (marker === JPEG_END_OF_IMAGE) {
			if (scanOffset !== bytes.length || entropyBytes < 32) return null;
			return { ...dimensions, sampleBytes: bytes.subarray(scanStart, scanOffset - 2) };
		}
		return null;
	}
	return null;
}

function unsupportedScreenshotFormat(bytes: Buffer): string | null {
	if (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a") return "GIF";
	if (bytes.toString("ascii", 0, 2) === "BM") return "BMP";
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
		return "WebP";
	return null;
}

function parseImageDimensions(
	bytes: Buffer,
): { width: number; height: number; headerBytes: number; sampleBytes?: Buffer } | null {
	return parsePngDimensions(bytes) ?? parseJpegDimensions(bytes);
}

/** Reject blank/solid/tiny/placeholder imagery by sampling byte distribution. */
function hasNonUniformImageBytes(bytes: Buffer, headerBytes: number, sampleBytes?: Buffer): boolean {
	const source = sampleBytes ?? bytes;
	const sampleStart = sampleBytes ? 0 : Math.min(Math.max(headerBytes, 0), source.length);
	const sampleLength = source.length - sampleStart;
	if (sampleLength < 32) return false;
	const windows: Buffer[] = [];
	for (let index = 0; index < 64; index += 1) {
		const offset = sampleStart + Math.floor(((sampleLength - 32) * index) / 63);
		windows.push(source.subarray(offset, offset + 32));
	}
	const byteCounts = new Map<number, number>();
	let total = 0;
	for (const window of windows) {
		for (const byte of window) {
			byteCounts.set(byte, (byteCounts.get(byte) ?? 0) + 1);
			total += 1;
		}
	}
	const first = windows[0]!;
	const differingWindows = windows.slice(1).filter((window) => !window.equals(first)).length;
	const maxCount = Math.max(...byteCounts.values());
	return byteCounts.size >= 16 && differingWindows >= 8 && maxCount / total <= 0.95;
}

async function validateScreenshotArtifact(
	cwd: string,
	row: Record<string, unknown>,
	fieldName: string,
): Promise<boolean> {
	const bytes = await readArtifactBytes(cwd, row, fieldName);
	if (!bytes) throw new Error(`qualityGate ${fieldName} screenshot artifact path must resolve to an existing file`);
	if (bytes.length < MIN_SCREENSHOT_BYTES)
		throw new Error(`qualityGate ${fieldName} screenshot artifact must be at least ${MIN_SCREENSHOT_BYTES} bytes`);
	const unsupportedFormat = unsupportedScreenshotFormat(bytes);
	if (unsupportedFormat) {
		throw new Error(
			`qualityGate ${fieldName} unsupported/undecodable screenshot format ${unsupportedFormat}; use PNG or fully marker-validated JPEG`,
		);
	}
	const dimensions = parseImageDimensions(bytes);
	if (!dimensions)
		throw new Error(`qualityGate ${fieldName} screenshot artifact must be a decodable PNG or JPEG image`);
	if (dimensions.width < MIN_SCREENSHOT_WIDTH || dimensions.height < MIN_SCREENSHOT_HEIGHT) {
		throw new Error(
			`qualityGate ${fieldName} screenshot artifact must be at least ${MIN_SCREENSHOT_WIDTH}x${MIN_SCREENSHOT_HEIGHT} pixels`,
		);
	}
	if (!hasNonUniformImageBytes(bytes, dimensions.headerBytes, dimensions.sampleBytes)) {
		throw new Error(
			`qualityGate ${fieldName} screenshot artifact must be non-uniform, not blank, solid, tiny, or placeholder imagery`,
		);
	}
	return true;
}

function normalizeTranscriptTimestamp(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || value.trim().length === 0) return null;
	const numeric = Number(value);
	if (Number.isFinite(numeric)) return numeric;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

const SELECTOR_BEARING_ACTION_TYPES = new Set(["click", "fill", "press", "assert", "screenshot", "observe"]);

async function validateAutomationTranscriptArtifact(
	cwd: string,
	row: Record<string, unknown>,
	fieldName: string,
	options: { surfaceFamily: SurfaceFamily },
): Promise<boolean> {
	const bytes = await readArtifactBytes(cwd, row, fieldName);
	if (!bytes) throw new Error(`qualityGate ${fieldName} automation transcript path must resolve to an existing file`);
	let transcript: Record<string, unknown>;
	try {
		const parsed = JSON.parse(bytes.toString("utf8"));
		transcript = requireQualityGateObject(parsed, `${fieldName}.transcript`);
	} catch (error) {
		throw new Error(`qualityGate ${fieldName} automation transcript must be valid JSON: ${String(error)}`);
	}
	if (transcript.schemaVersion !== 1)
		throw new Error(`qualityGate ${fieldName} automation transcript schemaVersion must be 1`);
	// Gajae parity: an absent/empty transcript surface is compatible with any
	// family; a present surface must match the row's surface family.
	const surface = nonEmptyString(transcript.surface);
	if (surface && options.surfaceFamily !== "unknown" && surfaceFamily(surface) !== options.surfaceFamily) {
		throw new Error(
			`qualityGate ${fieldName} automation transcript surface is not compatible with ${options.surfaceFamily}`,
		);
	}
	if (!nonEmptyString(transcript.tool))
		throw new Error(`qualityGate ${fieldName} automation transcript tool must be non-empty`);
	const actions = requireObjectArray(transcript.actions, `${fieldName}.actions`);
	const assertionsValue = transcript.assertions;
	const assertions =
		assertionsValue === undefined ? [] : requireObjectArray(assertionsValue, `${fieldName}.assertions`);
	const timestamps: number[] = [];
	let hasSelectorBearingEntry = false;
	for (const [index, action] of actions.entries()) {
		const actionField = `${fieldName}.actions[${index}]`;
		const type = requiredStringField(action, "type", actionField).toLowerCase();
		const timestamp = normalizeTranscriptTimestamp(action.timestamp);
		if (timestamp === null) throw new Error(`qualityGate ${actionField}.timestamp must be present and parseable`);
		timestamps.push(timestamp);
		const selector = nonEmptyString(action.selector);
		if (SELECTOR_BEARING_ACTION_TYPES.has(type) && !selector)
			throw new Error(`qualityGate ${actionField}.selector must be non-empty`);
		if (type === "goto" && !nonEmptyString(action.url))
			throw new Error(`qualityGate ${actionField}.url must be non-empty`);
		if (type === "custom" && !selector && !nonEmptyString(action.target))
			throw new Error(`qualityGate ${actionField}.selector or target must be non-empty`);
		if (selector) hasSelectorBearingEntry = true;
	}
	for (const [index, assertion] of assertions.entries()) {
		const assertionField = `${fieldName}.assertions[${index}]`;
		const timestamp = normalizeTranscriptTimestamp(assertion.timestamp);
		if (timestamp === null) throw new Error(`qualityGate ${assertionField}.timestamp must be present and parseable`);
		timestamps.push(timestamp);
		if (nonEmptyString(assertion.status)?.toLowerCase() !== "passed")
			throw new Error(`qualityGate ${assertionField}.status must be passed`);
		if (nonEmptyString(assertion.selector)) hasSelectorBearingEntry = true;
	}
	for (let index = 1; index < timestamps.length; index += 1) {
		if (timestamps[index]! < timestamps[index - 1]!) {
			throw new Error(`qualityGate ${fieldName} automation transcript timestamps must be monotonic non-decreasing`);
		}
	}
	if (!hasSelectorBearingEntry) {
		throw new Error(
			`qualityGate ${fieldName} automation transcript must include at least one selector-bearing action or assertion`,
		);
	}
	return true;
}

async function validatePtyCaptureArtifact(
	cwd: string,
	row: Record<string, unknown>,
	fieldName: string,
): Promise<boolean> {
	const bytes = await readArtifactBytes(cwd, row, fieldName);
	if (!bytes) throw new Error(`qualityGate ${fieldName} PTY capture path must resolve to an existing file`);
	if (bytes.length < MIN_PTY_BYTES)
		throw new Error(`qualityGate ${fieldName} PTY capture must be at least ${MIN_PTY_BYTES} bytes`);
	const text = bytes.toString("utf8");
	const hasCsi = /\x1b\[[0-?]*[ -/]*[@-~]/.test(text);
	const hasOsc = /\x1b\][^\x07]*(?:\x07|\x1b\\)/.test(text);
	const hasAltOrCursor = /\x1b\[\?1049[hl]|\x1b\[H|\x1b\[2J/.test(text);
	const hasRedraw = /[\r\b]/.test(text) && hasCsi;
	if (!hasCsi && !hasOsc && !hasAltOrCursor && !hasRedraw) {
		throw new Error(`qualityGate ${fieldName} PTY capture must contain terminal control sequences`);
	}
	if (!/[\x20-\x7e]{10,}/.test(text)) {
		throw new Error(
			`qualityGate ${fieldName} PTY capture must contain a printable text run of at least 10 characters`,
		);
	}
	return true;
}

/** Classify an artifact row's structural kind from its `kind` field. */
export function structuralArtifactKind(row: Record<string, unknown>): "screenshot" | "automation" | "pty" | null {
	const raw = typeof row.kind === "string" ? row.kind : "";
	const kind = raw.toLowerCase().replaceAll("_", "-");
	const matches = (words: string[]): boolean => words.some((word) => kind.includes(word));
	if (matches(["screenshot", "image", "visual"])) return "screenshot";
	if (matches(["browser", "playwright", "pandawright", "automation", "app-automation"])) return "automation";
	if (matches(["pty", "tui", "terminal-capture"])) return "pty";
	return null;
}

/**
 * Validate a structural artifact row, dispatching by kind. Returns false when
 * the row does not declare a structural kind (caller decides whether that is
 * acceptable for the surface family).
 */
export async function validateStructuralArtifact(
	cwd: string,
	row: Record<string, unknown>,
	fieldName: string,
	options: { surfaceFamily: SurfaceFamily; live: boolean },
): Promise<boolean> {
	void options.live;
	const kind = structuralArtifactKind(row);
	if (!kind) return false;
	if (kind === "screenshot") return validateScreenshotArtifact(cwd, row, fieldName);
	if (kind === "automation") return validateAutomationTranscriptArtifact(cwd, row, fieldName, options);
	return validatePtyCaptureArtifact(cwd, row, fieldName);
}

/** Classify a surface token into a family (Gajae parity normalization). */
export function surfaceFamily(value: string): SurfaceFamily {
	const normalized = value.toLowerCase().replaceAll("_", "-").trim();
	if (
		["computer", "computer-use", "desktop-input", "native-input", "native", "desktop", "tui"].some((word) =>
			normalized.includes(word),
		)
	)
		return "native";
	if (["gui", "web", "browser", "ui", "visual"].some((word) => normalized.includes(word))) return "web";
	if (["cli", "terminal", "command"].some((word) => normalized.includes(word))) return "cli";
	return "unknown";
}

export function isLiveSurfaceFamily(family: SurfaceFamily): boolean {
	return family === "web" || family === "cli" || family === "native";
}
