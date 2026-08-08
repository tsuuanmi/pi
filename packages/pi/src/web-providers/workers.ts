import { ProfileWorkerPool } from "@tsuuanmi/pi-web-runtime";

export const webWorkers = new ProfileWorkerPool();

export function closeWebProfile(profileId: string): Promise<void> {
	return webWorkers.close(profileId);
}

export function closeWebWorkers(): Promise<void> {
	return webWorkers.closeAll();
}
