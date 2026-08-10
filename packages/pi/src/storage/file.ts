import { randomBytes } from "node:crypto";
import {
	chmodSync,
	closeSync,
	existsSync,
	fchmodSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

export function ensurePrivateDir(path: string): void {
	const created = mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE });
	if (process.platform !== "win32" && created !== undefined) chmodSync(path, DIRECTORY_MODE);
}

export function assertPrivateFile(path: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new Error(`Path is not a regular file: ${path}`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
		throw new Error(`File permissions must be 0600: ${path}`);
	}
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
	if (process.platform !== "win32") fchmodSync(fd, FILE_MODE);
	writeFileSync(fd, content, "utf8");
	fsyncSync(fd);
}

export function writePrivateFile(path: string, content: string): void {
	const dir = dirname(path);
	ensurePrivateDir(dir);
	if (existsSync(path)) assertPrivateFile(path);
	const temporaryPath = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
	let renamed = false;
	try {
		const fd = openSync(temporaryPath, "wx", FILE_MODE);
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
