/**
 * Step 04 — Component tests
 */
import { describe, it, expect } from "vitest"
import { Text, Box, VStack, HStack, Spacer, Container, stripAnsi, visibleLength } from "../src/components.js"

describe("Text", () => {
	it("renders a single line", () => {
		const t = new Text("Hello")
		expect(t.render(80)).toEqual(["Hello"])
	})

	it("renders multiple lines from newlines", () => {
		const t = new Text("Hello\nWorld")
		expect(t.render(80)).toEqual(["Hello", "World"])
	})

	it("wraps long lines at word boundaries", () => {
		const t = new Text("one two three four five", { wrap: true })
		const lines = t.render(10)
		// Each line should fit within width 10
		for (const line of lines) {
			expect(visibleLength(line)).toBeLessThanOrEqual(10)
		}
		// All words should be present
		const joined = lines.join(" ")
		expect(joined).toContain("one")
		expect(joined).toContain("five")
	})

	it("does not wrap when wrap=false", () => {
		const t = new Text("this is a very long line that exceeds width", { wrap: false })
		expect(t.render(10).length).toBe(1)
	})

	it("renders empty string as one empty line", () => {
		const t = new Text("")
		expect(t.render(80)).toEqual([""])
	})
})

describe("Spacer", () => {
	it("emits one empty line by default", () => {
		const s = new Spacer()
		expect(s.render(80)).toEqual([""])
	})

	it("emits n empty lines", () => {
		const s = new Spacer(3)
		expect(s.render(80)).toEqual(["", "", ""])
	})
})

describe("VStack", () => {
	it("stacks children vertically", () => {
		const stack = new VStack().add(new Text("Line 1"), new Text("Line 2"), new Text("Line 3"))
		expect(stack.render(80)).toEqual(["Line 1", "Line 2", "Line 3"])
	})

	it("passes width down to children", () => {
		let receivedWidth = 0
		const child: any = { render: (w: number) => { receivedWidth = w; return [""] } }
		const stack = new VStack().add(child)
		stack.render(42)
		expect(receivedWidth).toBe(42)
	})
})

describe("Box", () => {
	it("adds top and bottom borders", () => {
		const box = new Box(new Text("Hello"))
		const lines = box.render(20)
		// First and last lines should have corners
		expect(lines[0]).toContain("┌")
		expect(lines[0]).toContain("┐")
		expect(lines[lines.length - 1]).toContain("└")
		expect(lines[lines.length - 1]).toContain("┘")
	})

	it("has side borders on content lines", () => {
		const box = new Box(new Text("Hello"))
		const lines = box.render(20)
		// Middle line (index 1) should have │ borders
		expect(lines[1]).toContain("│")
	})

	it("total height = child lines + 2 (top + bottom border)", () => {
		const child = new VStack().add(new Text("A"), new Text("B"), new Text("C"))
		const box = new Box(child)
		const lines = box.render(20)
		expect(lines.length).toBe(5) // 3 content + 2 borders
	})

	it("inner width is 2 less than outer width", () => {
		// With width=10, inner width=8, so wrapping should use 8
		const longText = new Text("a b c d e f g h i j k l m n o p q", { wrap: true })
		const box = new Box(longText)
		const lines = box.render(10)
		for (const line of lines) {
			// Visible width of each line should be <= 10
			expect(visibleLength(stripAnsi(line))).toBeLessThanOrEqual(10)
		}
	})
})

describe("HStack", () => {
	it("places children side by side", () => {
		const left = new Text("LEFT")
		const right = new Text("RIGHT")
		const h = new HStack(left, right, 10)
		const lines = h.render(20)
		expect(lines[0]).toContain("LEFT")
		expect(lines[0]).toContain("RIGHT")
	})

	it("produces correct number of lines (max of both sides)", () => {
		const left = new Text("A\nB\nC")
		const right = new Text("X")
		const h = new HStack(left, right, 10)
		expect(h.render(20).length).toBe(3)
	})
})

describe("Container", () => {
	it("renders all children in order", () => {
		const c = new Container()
		c.add(new Text("First"), new Text("Second"))
		expect(c.render(80)).toEqual(["First", "Second"])
	})

	it("renders overlay centered over content", () => {
		const c = new Container()
		c.add(new Text("Background line 1"), new Text("Background line 2"), new Text("Background line 3"))
		c.setOverlay(new Box(new Text("Modal")))
		const lines = c.render(80)
		// With overlay, line count stays the same
		expect(lines.length).toBe(3)
	})

	it("removes overlay when setOverlay(null) is called", () => {
		const c = new Container()
		c.add(new Text("Content"))
		c.setOverlay(new Box(new Text("Modal")))
		c.setOverlay(null)
		const lines = c.render(80)
		expect(lines).toEqual(["Content"])
	})
})

describe("utilities", () => {
	it("stripAnsi removes escape sequences", () => {
		expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red")
		expect(stripAnsi("\x1b[1mbolded\x1b[0m text")).toBe("bolded text")
	})

	it("visibleLength counts characters without ANSI", () => {
		expect(visibleLength("\x1b[31mhello\x1b[0m")).toBe(5)
		expect(visibleLength("plain")).toBe(5)
	})
})
