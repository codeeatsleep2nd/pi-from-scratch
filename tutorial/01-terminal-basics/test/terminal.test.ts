/**
 * Step 01 — Terminal tests
 *
 * We test ANSI code generation without touching a real terminal.
 * Raw mode and actual rendering can't easily be unit-tested,
 * but we can verify the escape sequences are correct.
 */
import { describe, it, expect } from "vitest"
import {
	moveCursorUp,
	moveCursorToLineStart,
	clearLine,
	hideCursor,
	showCursor,
	beginSync,
	endSync,
	Color,
} from "../src/terminal.js"

describe("ANSI escape sequences", () => {
	it("moveCursorUp(3) produces the correct sequence", () => {
		expect(moveCursorUp(3)).toBe("\x1b[3A")
	})

	it("moveCursorUp(0) returns empty string", () => {
		expect(moveCursorUp(0)).toBe("")
	})

	it("moveCursorUp(1) produces correct single-line sequence", () => {
		expect(moveCursorUp(1)).toBe("\x1b[1A")
	})

	it("moveCursorToLineStart returns correct sequence", () => {
		expect(moveCursorToLineStart()).toBe("\x1b[0G")
	})

	it("clearLine returns correct sequence", () => {
		expect(clearLine()).toBe("\x1b[2K")
	})

	it("hideCursor returns correct sequence", () => {
		expect(hideCursor()).toBe("\x1b[?25l")
	})

	it("showCursor returns correct sequence", () => {
		expect(showCursor()).toBe("\x1b[?25h")
	})

	it("beginSync and endSync bracket synchronized output", () => {
		expect(beginSync()).toBe("\x1b[?2026h")
		expect(endSync()).toBe("\x1b[?2026l")
	})
})

describe("Color codes", () => {
	it("reset is correct", () => {
		expect(Color.reset).toBe("\x1b[0m")
	})

	it("wrapping text in a color and resetting", () => {
		const colored = `${Color.red}hello${Color.reset}`
		expect(colored).toBe("\x1b[31mhello\x1b[0m")
	})

	it("bold is correct", () => {
		expect(Color.bold).toBe("\x1b[1m")
	})
})

describe("Render output structure", () => {
	/**
	 * Test that a render operation would produce the right ANSI structure.
	 * We don't call renderLines() directly (it writes to stdout),
	 * but we verify the building blocks.
	 */
	it("a re-render of 3 lines starts with cursor-up-3", () => {
		const previousLineCount = 3
		const prefix = moveCursorUp(previousLineCount) + moveCursorToLineStart()
		expect(prefix).toBe("\x1b[3A\x1b[0G")
	})

	it("each line is cleared before being written", () => {
		const clearAndWrite = clearLine() + moveCursorToLineStart() + "Hello"
		expect(clearAndWrite).toBe("\x1b[2K\x1b[0GHello")
	})

	it("synchronized output wraps the entire render", () => {
		const render = beginSync() + "content" + endSync()
		expect(render.startsWith("\x1b[?2026h")).toBe(true)
		expect(render.endsWith("\x1b[?2026l")).toBe(true)
	})
})
