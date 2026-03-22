/**
 * Step 03 — Key Input tests
 */
import { describe, it, expect } from "vitest"
import { parseKey, matchesKey, isPrintable } from "../src/keys.js"

describe("parseKey", () => {
	it("parses printable ASCII characters as themselves", () => {
		expect(parseKey("a")).toBe("a")
		expect(parseKey("Z")).toBe("Z")
		expect(parseKey(" ")).toBe(" ")
		expect(parseKey("!")).toBe("!")
	})

	it("parses Ctrl+C (0x03)", () => {
		expect(parseKey("\x03")).toBe("ctrl+c")
	})

	it("parses Ctrl+A (0x01)", () => {
		expect(parseKey("\x01")).toBe("ctrl+a")
	})

	it("parses Enter (CR and LF)", () => {
		expect(parseKey("\r")).toBe("enter")
		expect(parseKey("\n")).toBe("enter")
	})

	it("parses Tab", () => {
		expect(parseKey("\t")).toBe("tab")
	})

	it("parses Backspace (0x7f)", () => {
		expect(parseKey("\x7f")).toBe("backspace")
	})

	it("parses Escape alone", () => {
		expect(parseKey("\x1b")).toBe("escape")
	})

	it("parses arrow keys", () => {
		expect(parseKey("\x1b[A")).toBe("arrow_up")
		expect(parseKey("\x1b[B")).toBe("arrow_down")
		expect(parseKey("\x1b[C")).toBe("arrow_right")
		expect(parseKey("\x1b[D")).toBe("arrow_left")
	})

	it("parses Home and End", () => {
		expect(parseKey("\x1b[H")).toBe("home")
		expect(parseKey("\x1b[F")).toBe("end")
	})

	it("parses Page Up / Down", () => {
		expect(parseKey("\x1b[5~")).toBe("page_up")
		expect(parseKey("\x1b[6~")).toBe("page_down")
	})

	it("parses Delete", () => {
		expect(parseKey("\x1b[3~")).toBe("delete")
	})

	it("parses Shift+Tab", () => {
		expect(parseKey("\x1b[Z")).toBe("shift+tab")
	})

	it("parses function keys", () => {
		expect(parseKey("\x1bOP")).toBe("f1")
		expect(parseKey("\x1bOQ")).toBe("f2")
	})

	it("parses Kitty protocol Ctrl+C", () => {
		// Kitty: \x1b[99;5u  (keycode 99 = 'c', modifier 5 = ctrl+1)
		expect(parseKey("\x1b[99;5u")).toBe("ctrl+c")
	})

	it("parses Kitty protocol Ctrl+Enter", () => {
		// Kitty: \x1b[13;5u  (keycode 13 = enter, modifier 5 = ctrl)
		expect(parseKey("\x1b[13;5u")).toBe("ctrl+enter")
	})

	it("represents unknown sequences as hex description", () => {
		const result = parseKey("\x1b[999~")
		expect(result).toMatch(/^<unknown:/)
	})

	it("parses multi-byte UTF-8 as-is", () => {
		expect(parseKey("é")).toBe("é")
		expect(parseKey("🎉")).toBe("🎉")
	})
})

describe("matchesKey", () => {
	it("matches a single key", () => {
		expect(matchesKey("\x03", "ctrl+c")).toBe(true)
		expect(matchesKey("\x03", "ctrl+d")).toBe(false)
	})

	it("matches any of multiple keys", () => {
		expect(matchesKey("\x1b[A", "arrow_up", "arrow_down")).toBe(true)
		expect(matchesKey("\x1b[B", "arrow_up", "arrow_down")).toBe(true)
		expect(matchesKey("\x1b[C", "arrow_up", "arrow_down")).toBe(false)
	})

	it("matches printable characters", () => {
		expect(matchesKey("q", "q")).toBe(true)
		expect(matchesKey("q", "a")).toBe(false)
	})
})

describe("isPrintable", () => {
	it("returns true for printable ASCII", () => {
		expect(isPrintable("a")).toBe(true)
		expect(isPrintable("Z")).toBe(true)
		expect(isPrintable("1")).toBe(true)
	})

	it("returns false for control sequences", () => {
		expect(isPrintable("\x03")).toBe(false) // ctrl+c
		expect(isPrintable("\x1b[A")).toBe(false) // arrow up
		expect(isPrintable("\x7f")).toBe(false) // backspace
	})

	it("returns false for named special keys", () => {
		expect(isPrintable("\x1b")).toBe(false) // escape
		expect(isPrintable("\t")).toBe(false) // tab
	})
})
