import { randomBytes } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

export function ensureDir(path: string): void {
	mkdirSync(path, { recursive: true });
}

export function assertRegularFile(path: string): void {
	if (!lstatSync(path).isFile()) throw new Error(`Path is not a regular file: ${path}`);
}

function syncDirectory(path: string): void {
	if (process.platform === "win32") return;
	const fd = openSync(path, "r");
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function writeDescriptor(fd: number, content: string): void {
	writeFileSync(fd, content, "utf8");
	fsyncSync(fd);
}

export function writeFile(path: string, content: string): void {
	const dir = dirname(path);
	ensureDir(dir);
	if (existsSync(path)) assertRegularFile(path);
	const temporaryPath = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
	let renamed = false;
	try {
		const fd = openSync(temporaryPath, "wx");
		try {
			writeDescriptor(fd, content);
		} finally {
			closeSync(fd);
		}
		renameSync(temporaryPath, path);
		renamed = true;
		syncDirectory(dir);
	} finally {
		if (!renamed) rmSync(temporaryPath, { force: true });
	}
}
