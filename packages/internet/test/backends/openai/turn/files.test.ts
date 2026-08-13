import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandLocalFileReferences } from "#internet/backends/openai/turn/files";

function payload(text: string) {
	return {
		input: [{ role: "user", content: [{ type: "input_text", text }] }],
	};
}

describe("expandLocalFileReferences", () => {
	it("inlines unique workspace text files on the active user message", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-internet-files-"));
		await mkdir(join(cwd, "docs"));
		await writeFile(join(cwd, "README.md"), "# Project\n");
		await writeFile(join(cwd, "docs", "guide.txt"), "Guide\n");
		const result = (await expandLocalFileReferences(
			payload("Overview @README.md and @docs/guide.txt then compare @README.md"),
			cwd,
		)) as ReturnType<typeof payload>;
		const content = result.input[0]?.content;
		expect(content).toHaveLength(2);
		expect(content?.[1]?.text).toContain('"path":"README.md","content":"# Project\\n"');
		expect(content?.[1]?.text).toContain('"path":"docs/guide.txt","content":"Guide\\n"');
		expect(content?.[1]?.text.match(/"path":"README.md"/g)).toHaveLength(1);
	});

	it("is idempotent", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-internet-files-"));
		await writeFile(join(cwd, "README.md"), "# Project\n");
		const first = await expandLocalFileReferences(payload("Read @README.md"), cwd);
		await expect(expandLocalFileReferences(first, cwd)).resolves.toEqual(first);
	});

	it("rejects hidden, traversal, binary, and oversized files", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-internet-files-"));
		await writeFile(join(cwd, ".env"), "SECRET=value\n");
		await writeFile(join(cwd, "binary.bin"), Buffer.from([1, 0, 2]));
		await writeFile(join(cwd, "large.txt"), "x".repeat(128 * 1024 + 1));
		await expect(expandLocalFileReferences(payload("Read @.env"), cwd)).rejects.toThrow("non-hidden");
		await expect(expandLocalFileReferences(payload("Read @../secret.txt"), cwd)).rejects.toThrow("non-hidden");
		await expect(expandLocalFileReferences(payload("Read @binary.bin"), cwd)).rejects.toThrow("text file");
		await expect(expandLocalFileReferences(payload("Read @large.txt"), cwd)).rejects.toThrow("exceeds");
	});

	it("leaves payloads without references and ordinary mentions unchanged", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-internet-files-"));
		const plain = payload("No files here");
		const mention = payload("Email @support about this");
		await expect(expandLocalFileReferences(plain, cwd)).resolves.toBe(plain);
		await expect(expandLocalFileReferences(mention, cwd)).resolves.toBe(mention);
	});

	it("rejects symlinks that escape the workspace", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-internet-files-"));
		const outside = join(await mkdtemp(join(tmpdir(), "pi-internet-outside-")), "secret.txt");
		await writeFile(outside, "secret\n");
		await symlink(outside, join(cwd, "linked.txt"));
		await expect(expandLocalFileReferences(payload("Read @linked.txt"), cwd)).rejects.toThrow("inside the workspace");
	});
});
