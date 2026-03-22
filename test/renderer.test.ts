/**
 * Chapter 02 — Differential Renderer tests
 *
 * We capture the ANSI output as a string and verify:
 * - Only changed lines are rewritten
 * - Unchanged frames produce no output
 * - Shrinking frames erase trailing lines
 * - Cursor is tracked precisely so movement is correct when only a middle line changes
 */
import { describe, it, expect, beforeEach } from "vitest"
import { DifferentialRenderer } from "../src/renderer.js"

/** Strip all ANSI escape sequences for readable assertions */
function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b_[^]*?\x07/g, "")
}

/** Capture renderer output instead of writing to stdout */
function capture(renderer: DifferentialRenderer, lines: string[]): string {
	let out = ""
	renderer.render(lines, (s) => {
		out += s
	})
	return out
}

describe("DifferentialRenderer", () => {
	let renderer: DifferentialRenderer

	beforeEach(() => {
		renderer = new DifferentialRenderer()
	})

	it("first render writes all lines", () => {
		const out = capture(renderer, ["Line A", "Line B", "Line C"])
		expect(out).toContain("Line A")
		expect(out).toContain("Line B")
		expect(out).toContain("Line C")
	})

	it("identical frame produces no output", () => {
		capture(renderer, ["Same", "Same"])
		const out = capture(renderer, ["Same", "Same"])
		expect(out).toBe("")
	})

	it("only the changed line appears in output when one line changes", () => {
		capture(renderer, ["Line A", "Line B", "Line C"])
		const out = capture(renderer, ["Line A", "CHANGED", "Line C"])

		// The changed line should appear
		expect(out).toContain("CHANGED")
		// Unchanged lines should NOT appear (they are skipped)
		expect(stripAnsi(out)).not.toContain("Line A")
		expect(stripAnsi(out)).not.toContain("Line C")
	})

	it("renders all lines when first line changes", () => {
		capture(renderer, ["A", "B", "C"])
		const out = capture(renderer, ["CHANGED", "B", "C"])
		expect(out).toContain("CHANGED")
	})

	it("tracks line count correctly", () => {
		capture(renderer, ["A", "B", "C"])
		expect(renderer.lineCount).toBe(3)
		capture(renderer, ["A", "B"])
		expect(renderer.lineCount).toBe(2)
	})

	it("shrinking the frame does not leave ghost lines", () => {
		capture(renderer, ["A", "B", "C", "D"])
		// Shrink to 2 lines — the old lines C and D must be cleared
		const out = capture(renderer, ["A", "CHANGED"])

		// "CHANGED" should be written
		expect(out).toContain("CHANGED")
		// The output should contain clear-line sequences to erase old lines
		// (2K is the "clear entire line" code)
		expect(out).toContain("\x1b[2K")
	})

	it("growing the frame adds new lines", () => {
		capture(renderer, ["A", "B"])
		const out = capture(renderer, ["A", "B", "C", "D"])
		expect(out).toContain("C")
		expect(out).toContain("D")
	})

	it("reset() causes next render to treat everything as new", () => {
		capture(renderer, ["A", "B"])
		renderer.reset()
		expect(renderer.lineCount).toBe(0)
		// After reset, everything should be re-rendered
		const out = capture(renderer, ["A", "B"])
		expect(out).toContain("A")
		expect(out).toContain("B")
	})

	it("is wrapped in synchronized output markers", () => {
		const out = capture(renderer, ["Hello"])
		expect(out).toContain("\x1b[?2026h") // begin sync
		expect(out).toContain("\x1b[?2026l") // end sync
	})

	it("empty new frame clears everything", () => {
		capture(renderer, ["A", "B", "C"])
		const out = capture(renderer, [])
		// Should contain clear-line sequences
		expect(out).toContain("\x1b[2K")
	})

	it("moves cursor up from lastChanged, not from bottom of frame", () => {
		// First render: 5 lines — cursor ends at lastChanged=4
		capture(renderer, ["A", "B", "C", "D", "E"])
		// Second render: only line 1 changes — cursor ends at line 1
		capture(renderer, ["A", "X", "C", "D", "E"])
		// Third render: only line 3 changes — cursor is at 1, firstChanged=3
		// Bug (before fix): code assumed cursor was at prev.length-1=4, moved up 1 → wrong
		// Fix: code knows cursor is at 1, moves down 2 → correct
		const out = capture(renderer, ["A", "X", "C", "Y", "E"])
		expect(out).toContain("\x1b[2B") // cursor down 2 lines (1 → 3)
		expect(out).toContain("Y")
		// Lines that didn't change should not be rewritten
		expect(stripAnsi(out)).not.toContain("A")
		expect(stripAnsi(out)).not.toContain("X")
		expect(stripAnsi(out)).not.toContain("E")
	})

	it("handles repeated middle-line updates without ghost lines", () => {
		// This is the exact scenario from the demo bug:
		// frame counter at line 1 updates every tick, items at lines 3-7 change on keypress
		capture(renderer, ["Header", "Frame: 1", "", "▶ Item A", "  Item B", "  Item C"])
		// Tick: only frame counter changes, cursor ends at line 1
		capture(renderer, ["Header", "Frame: 2", "", "▶ Item A", "  Item B", "  Item C"])
		// Keypress: frame counter + item lines change, cursor must move DOWN to reach them
		const out = capture(renderer, ["Header", "Frame: 3", "", "  Item A", "▶ Item B", "  Item C"])
		// All three changed lines should appear
		expect(out).toContain("Frame: 3")
		expect(out).toContain("Item A")
		expect(out).toContain("▶ Item B")
		// Unchanged lines should not appear
		expect(stripAnsi(out)).not.toContain("Header")
		expect(stripAnsi(out)).not.toContain("Item C")
	})
})
