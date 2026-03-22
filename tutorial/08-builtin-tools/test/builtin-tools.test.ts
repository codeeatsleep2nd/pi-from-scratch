/**
 * Step 08 — Built-in Tools tests
 *
 * Uses a temporary directory for all file operations.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises"
import { join, resolve } from "path"
import { tmpdir } from "os"
import { readTool } from "../src/tools/read.js"
import { writeTool } from "../src/tools/write.js"
import { editTool } from "../src/tools/edit.js"
import { bashTool } from "../src/tools/bash.js"

let tmpDir: string

beforeEach(async () => {
	tmpDir = await mkdtemp(join(tmpdir(), "pi-tutorial-test-"))
})

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Read Tool
// ---------------------------------------------------------------------------

describe("readTool", () => {
	it("reads a simple text file", async () => {
		const path = join(tmpDir, "hello.txt")
		await writeFile(path, "Hello, World!\nSecond line.")
		const result = await readTool.execute({ path })
		expect(result.isError).toBe(false)
		expect(result.content).toContain("Hello, World!")
		expect(result.content).toContain("Second line.")
	})

	it("returns error for missing file", async () => {
		const result = await readTool.execute({ path: join(tmpDir, "nonexistent.txt") })
		expect(result.isError).toBe(true)
		expect(result.content).toContain("not found")
	})

	it("truncates files with more than 3000 lines", async () => {
		const path = join(tmpDir, "big.txt")
		const lines = Array.from({ length: 4000 }, (_, i) => `Line ${i + 1}`)
		await writeFile(path, lines.join("\n"))
		const result = await readTool.execute({ path })
		expect(result.isError).toBe(false)
		expect(result.content).toContain("showing lines 1–3000")
	})

	it("respects offset and limit", async () => {
		const path = join(tmpDir, "lines.txt")
		await writeFile(path, "Line 1\nLine 2\nLine 3\nLine 4\nLine 5")
		const result = await readTool.execute({ path, offset: 2, limit: 2 })
		expect(result.isError).toBe(false)
		expect(result.content).toContain("Line 2")
		expect(result.content).toContain("Line 3")
		expect(result.content).not.toContain("Line 1")
		expect(result.content).not.toContain("Line 4")
	})

	it("returns error for binary files", async () => {
		const path = join(tmpDir, "binary.zip")
		await writeFile(path, Buffer.from([0x50, 0x4b, 0x03, 0x04])) // ZIP magic bytes
		const result = await readTool.execute({ path })
		expect(result.isError).toBe(true)
		expect(result.content).toContain("binary")
	})

	it("returns metadata for image files", async () => {
		const path = join(tmpDir, "image.png")
		await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47])) // PNG magic bytes
		const result = await readTool.execute({ path })
		expect(result.isError).toBe(false)
		expect(result.content).toContain("Image file")
	})
})

// ---------------------------------------------------------------------------
// Write Tool
// ---------------------------------------------------------------------------

describe("writeTool", () => {
	it("creates a new file", async () => {
		const path = join(tmpDir, "new.txt")
		const result = await writeTool.execute({ path, content: "Hello!" })
		expect(result.isError).toBe(false)
		expect(result.content).toContain("Wrote")
	})

	it("overwrites an existing file", async () => {
		const path = join(tmpDir, "existing.txt")
		await writeFile(path, "Old content")
		const result = await writeTool.execute({ path, content: "New content" })
		expect(result.isError).toBe(false)
		// Verify the content was actually changed
		const readResult = await readTool.execute({ path })
		expect(readResult.content).toContain("New content")
		expect(readResult.content).not.toContain("Old content")
	})

	it("creates parent directories", async () => {
		const path = join(tmpDir, "nested", "deep", "file.txt")
		const result = await writeTool.execute({ path, content: "Deep file" })
		expect(result.isError).toBe(false)
		const readResult = await readTool.execute({ path })
		expect(readResult.content).toContain("Deep file")
	})

	it("reports file size in result", async () => {
		const path = join(tmpDir, "sized.txt")
		const content = "A".repeat(1024)
		const result = await writeTool.execute({ path, content })
		expect(result.isError).toBe(false)
		expect(result.content).toMatch(/KB|bytes/) // size should be mentioned
	})
})

// ---------------------------------------------------------------------------
// Edit Tool
// ---------------------------------------------------------------------------

describe("editTool", () => {
	it("replaces an exact string", async () => {
		const path = join(tmpDir, "edit.ts")
		await writeFile(path, "const x = 1;\nconst y = 2;\nconst z = 3;")
		const result = await editTool.execute({
			path,
			oldString: "const y = 2;",
			newString: "const y = 42;",
		})
		expect(result.isError).toBe(false)
		const readResult = await readTool.execute({ path })
		expect(readResult.content).toContain("const y = 42;")
		expect(readResult.content).not.toContain("const y = 2;")
	})

	it("returns error when string not found", async () => {
		const path = join(tmpDir, "notfound.txt")
		await writeFile(path, "Hello world")
		const result = await editTool.execute({ path, oldString: "goodbye world", newString: "hi" })
		expect(result.isError).toBe(true)
		expect(result.content).toContain("not found")
	})

	it("returns error when string appears multiple times", async () => {
		const path = join(tmpDir, "duplicate.txt")
		await writeFile(path, "foo\nfoo\nbar")
		const result = await editTool.execute({ path, oldString: "foo", newString: "baz" })
		expect(result.isError).toBe(true)
		expect(result.content).toContain("2 times")
	})

	it("returns error when file does not exist", async () => {
		const result = await editTool.execute({
			path: join(tmpDir, "missing.txt"),
			oldString: "x",
			newString: "y",
		})
		expect(result.isError).toBe(true)
		expect(result.content).toContain("not found")
	})

	it("handles multi-line replacements", async () => {
		const path = join(tmpDir, "multiline.ts")
		await writeFile(path, "function foo() {\n  return 1;\n}\n\nfunction bar() {\n  return 2;\n}")
		const result = await editTool.execute({
			path,
			oldString: "function foo() {\n  return 1;\n}",
			newString: "function foo() {\n  return 100;\n}",
		})
		expect(result.isError).toBe(false)
		const readResult = await readTool.execute({ path })
		expect(readResult.content).toContain("return 100")
	})
})

// ---------------------------------------------------------------------------
// Bash Tool
// ---------------------------------------------------------------------------

describe("bashTool", () => {
	it("runs a simple command", async () => {
		const result = await bashTool.execute({ command: "echo 'hello bash'" })
		expect(result.isError).toBe(false)
		expect(result.content).toContain("hello bash")
	})

	it("captures stderr", async () => {
		const result = await bashTool.execute({ command: "echo 'error output' >&2; exit 1" })
		expect(result.isError).toBe(true) // exit code 1
		expect(result.content).toContain("error output")
	})

	it("returns non-zero exit as error", async () => {
		const result = await bashTool.execute({ command: "exit 42" })
		expect(result.isError).toBe(true)
		expect(result.content).toContain("42")
	})

	it("respects timeout", async () => {
		const result = await bashTool.execute({ command: "sleep 10", timeout: 200 })
		expect(result.isError).toBe(true)
		expect(result.content).toContain("timed out")
	}, 5000)

	it("runs in specified working directory", async () => {
		const subDir = join(tmpDir, "subdir")
		await mkdir(subDir)
		const result = await bashTool.execute({ command: "pwd", cwd: subDir })
		expect(result.isError).toBe(false)
		expect(result.content).toContain("subdir")
	})

	it("returns (no output) for commands with no output", async () => {
		const result = await bashTool.execute({ command: "true" })
		expect(result.isError).toBe(false)
		// "true" produces no stdout/stderr
	})

	it("handles AbortSignal", async () => {
		const controller = new AbortController()
		const promise = bashTool.execute({ command: "sleep 10" }, controller.signal)
		// Abort immediately
		controller.abort()
		const result = await promise
		expect(result.isError).toBe(true)
	}, 5000)
})
