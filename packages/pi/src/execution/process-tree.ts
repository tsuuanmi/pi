/** Track detached command processes for shutdown cleanup. */
const trackedPids = new Set<number>();

export function trackProcess(pid: number): void {
	trackedPids.add(pid);
}

export function untrackProcess(pid: number): void {
	trackedPids.delete(pid);
}

export function killTrackedProcesses(): void {
	for (const pid of trackedPids) {
		killProcessTree(pid);
	}
	trackedPids.clear();
}

export function killProcessTree(pid: number): void {
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Process already exited.
		}
	}
}
