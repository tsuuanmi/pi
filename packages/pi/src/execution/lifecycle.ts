import { killProcessTree } from "@tsuuanmi/pi-agent/node";

const pids = new Set<number>();

export function track(pid: number): void {
	pids.add(pid);
}

export function untrack(pid: number): void {
	pids.delete(pid);
}

export function killTracked(): void {
	for (const pid of pids) killProcessTree(pid);
	pids.clear();
}
