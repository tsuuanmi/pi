/**
 * Pi's session consumers use the canonical root primitives owned by
 * the lower-level workflows package. Pi owns the state written below these
 * roots; it does not maintain a second session path implementation.
 */
export { piSessionRoot, sessionStateDir } from "@tsuuanmi/pi-workflows/session/root";
