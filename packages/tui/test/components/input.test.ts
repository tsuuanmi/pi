import assert from "node:assert";
import { describe, it } from "node:test";
import { Input } from "#tui/components/input";
import { visibleWidth } from "#tui/utils";

describe("Input component", () => {
	it("submits value including backslash on Enter", () => {
		const input = new Input();
		let submitted: string | undefined;

		input.onSubmit = (value) => {
			submitted = value;
		};

		// Type hello, then backslash, then Enter
		input.handleInput("h");
		input.handleInput("e");
		input.handleInput("l");
		input.handleInput("l");
		input.handleInput("o");
		input.handleInput("\\");
		input.handleInput("\r");

		// Input is single-line, no backslash+Enter workaround
		assert.strictEqual(submitted, "hello\\");
	});

	it("inserts backslash as regular character", () => {
		const input = new Input();

		input.handleInput("\\");
		input.handleInput("x");

		assert.strictEqual(input.getValue(), "\\x");
	});

	describe("render", () => {
		it("does not overflow with wide CJK and fullwidth text", () => {
			const width = 93;
			const cases = [
				"가나다라마바사아자차카타파하 한글 텍스트가 터미널 너비를 초과하면 크래시가 발생합니다 이것은 재현용 테스트입니다",
				"これはテスト文章です。日本語のテキストが正しく表示されるかどうかを確認するためのサンプルテキストです。あいうえお",
				"这是一段测试文本，用于验证中文字符在终端中的显示宽度是否被正确计算，如果不正确就会导致用户界面崩溃的问题",
				"ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ０１２３４５６７８９ａｂｃｄｅｆｇｈｉｊｋｌｍ",
			];
			const cursorPositions = [
				{ label: "start", move: (_input: Input) => {} },
				{
					label: "middle",
					move: (input: Input) => {
						for (let i = 0; i < 10; i++) input.handleInput("\x1b[C");
					},
				},
				{ label: "end", move: (input: Input) => input.handleInput("\x05") },
			];

			for (const text of cases) {
				for (const { label, move } of cursorPositions) {
					const input = new Input();
					input.setValue(text);
					input.focused = true;
					move(input);

					const [line] = input.render(width);
					assert.ok(line);
					assert.ok(visibleWidth(line) <= width, `rendered line overflowed for ${text} at ${label}`);
				}
			}
		});

		it("keeps the cursor visible when horizontally scrolling wide text", () => {
			const input = new Input();
			const width = 20;
			const text = "가나다라마바사아자차카타파하";
			input.setValue(text);
			input.focused = true;
			input.handleInput("\x01");
			for (let i = 0; i < 5; i++) input.handleInput("\x1b[C");

			const [line] = input.render(width);
			assert.ok(line);
			assert.ok(visibleWidth(line) <= width);
		});
	});

	describe("Undo", () => {
		it("does nothing when undo stack is empty", () => {
			const input = new Input();

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "");
		});

		it("coalesces consecutive word characters into one undo unit", () => {
			const input = new Input();

			input.handleInput("h");
			input.handleInput("e");
			input.handleInput("l");
			input.handleInput("l");
			input.handleInput("o");
			input.handleInput(" ");
			input.handleInput("w");
			input.handleInput("o");
			input.handleInput("r");
			input.handleInput("l");
			input.handleInput("d");
			assert.strictEqual(input.getValue(), "hello world");

			// Undo removes " world"
			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "hello");

			// Undo removes "hello"
			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "");
		});

		it("undoes spaces one at a time", () => {
			const input = new Input();

			input.handleInput("h");
			input.handleInput("e");
			input.handleInput("l");
			input.handleInput("l");
			input.handleInput("o");
			input.handleInput(" ");
			input.handleInput(" ");
			assert.strictEqual(input.getValue(), "hello  ");

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo) - removes second " "
			assert.strictEqual(input.getValue(), "hello ");

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo) - removes first " "
			assert.strictEqual(input.getValue(), "hello");

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo) - removes "hello"
			assert.strictEqual(input.getValue(), "");
		});

		it("undoes backspace", () => {
			const input = new Input();

			input.handleInput("h");
			input.handleInput("e");
			input.handleInput("l");
			input.handleInput("l");
			input.handleInput("o");
			input.handleInput("\x7f"); // Backspace
			assert.strictEqual(input.getValue(), "hell");

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "hello");
		});

		it("undoes forward delete", () => {
			const input = new Input();

			input.handleInput("h");
			input.handleInput("e");
			input.handleInput("l");
			input.handleInput("l");
			input.handleInput("o");
			input.handleInput("\x01"); // Ctrl+A - go to start
			input.handleInput("\x1b[C"); // Right arrow
			input.handleInput("\x1b[3~"); // Delete key
			assert.strictEqual(input.getValue(), "hllo");

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "hello");
		});

		it("undoes Ctrl+W (delete word backward)", () => {
			const input = new Input();

			input.handleInput("h");
			input.handleInput("e");
			input.handleInput("l");
			input.handleInput("l");
			input.handleInput("o");
			input.handleInput(" ");
			input.handleInput("w");
			input.handleInput("o");
			input.handleInput("r");
			input.handleInput("l");
			input.handleInput("d");
			assert.strictEqual(input.getValue(), "hello world");

			input.handleInput("\x17"); // Ctrl+W
			assert.strictEqual(input.getValue(), "hello ");

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "hello world");
		});

		it("undoes Ctrl+K (delete to line end)", () => {
			const input = new Input();

			input.handleInput("h");
			input.handleInput("e");
			input.handleInput("l");
			input.handleInput("l");
			input.handleInput("o");
			input.handleInput(" ");
			input.handleInput("w");
			input.handleInput("o");
			input.handleInput("r");
			input.handleInput("l");
			input.handleInput("d");
			input.handleInput("\x01"); // Ctrl+A
			for (let i = 0; i < 6; i++) input.handleInput("\x1b[C");

			input.handleInput("\x0b"); // Ctrl+K
			assert.strictEqual(input.getValue(), "hello ");

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "hello world");
		});

		it("undoes Ctrl+U (delete to line start)", () => {
			const input = new Input();

			input.handleInput("h");
			input.handleInput("e");
			input.handleInput("l");
			input.handleInput("l");
			input.handleInput("o");
			input.handleInput(" ");
			input.handleInput("w");
			input.handleInput("o");
			input.handleInput("r");
			input.handleInput("l");
			input.handleInput("d");
			input.handleInput("\x01"); // Ctrl+A
			for (let i = 0; i < 6; i++) input.handleInput("\x1b[C");

			input.handleInput("\x15"); // Ctrl+U
			assert.strictEqual(input.getValue(), "world");

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "hello world");
		});

		it("undoes paste atomically", () => {
			const input = new Input();

			input.setValue("hello world");
			input.handleInput("\x01"); // Ctrl+A
			for (let i = 0; i < 5; i++) input.handleInput("\x1b[C");

			// Simulate bracketed paste
			input.handleInput("\x1b[200~beep boop\x1b[201~");
			assert.strictEqual(input.getValue(), "hellobeep boop world");

			// Single undo should restore entire pre-paste state
			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "hello world");
		});

		it("undoes Alt+D (delete word forward)", () => {
			const input = new Input();

			input.setValue("hello world");
			input.handleInput("\x01"); // Ctrl+A

			input.handleInput("\x1bd"); // Alt+D - deletes "hello"
			assert.strictEqual(input.getValue(), " world");

			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "hello world");
		});

		it("cursor movement starts new undo unit", () => {
			const input = new Input();

			input.handleInput("a");
			input.handleInput("b");
			input.handleInput("c");
			input.handleInput("\x01"); // Ctrl+A - movement breaks coalescing
			input.handleInput("\x05"); // Ctrl+E
			input.handleInput("d");
			input.handleInput("e");
			assert.strictEqual(input.getValue(), "abcde");

			// Undo removes "de" (typed after movement)
			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "abc");

			// Undo removes "abc"
			input.handleInput("\x1b[45;5u"); // Ctrl+- (undo)
			assert.strictEqual(input.getValue(), "");
		});
	});
});
