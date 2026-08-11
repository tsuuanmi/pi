import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";

/**
 * Package extension entrypoint.
 *
 * The internet package is scaffolded and does not register behavior yet, but its
 * manifest must still expose a valid factory so Pi can load the package safely.
 */
export default function internetExtension(_pi: ExtensionAPI): void {}
