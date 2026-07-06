/**
 * Truncation utilities for tool outputs.
 *
 * Re-exported from @tsuuanmi/pi-agent, which provides the canonical
 * browser-compatible implementation.
 */
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	GREP_MAX_LINE_LENGTH,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "@tsuuanmi/pi-agent";
