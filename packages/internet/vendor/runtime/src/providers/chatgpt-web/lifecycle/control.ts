import type { RuntimeServiceConfig } from "#runtime/core/config";
import { requestControl } from "#runtime/core/service";

export async function cancelBrowserTurns(config: RuntimeServiceConfig): Promise<number> {
  const result = await requestControl(config, "cancel-browser-turns");
  const cancelled = result.cancelled_browser_turns;
  if (!Number.isInteger(cancelled) || (cancelled as number) < 0) {
    throw new Error("daemon did not acknowledge browser-turn cancellation");
  }
  return cancelled as number;
}
