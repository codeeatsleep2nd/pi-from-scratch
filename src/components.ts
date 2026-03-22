/**
 * Step 04 — Component System
 *
 * Every component renders itself as string[] (array of terminal lines).
 * Components are composed into trees; the root renders on each frame.
 */

// ---------------------------------------------------------------------------
// Component interface
// ---------------------------------------------------------------------------

export interface Component {
	/** Render this component into an array of terminal lines of the given width */
	render(width: number): string[]
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Renders a string, wrapping long lines at word boundaries.
 */
export class Text implements Component {
	constructor(
		private text: string,
		private options: { wrap?: boolean; style?: string } = {},
	) {}

	render(width: number): string[] {
		const { wrap = true, style = "" } = this.options
		const reset = style ? "\x1b[0m" : ""
		const lines: string[] = []

		for (const rawLine of this.text.split("\n")) {
			if (!wrap || visibleLength(rawLine) <= width) {
				lines.push(style + rawLine + reset)
				continue
			}

			// Word-wrap
			const words = rawLine.split(" ")
			let current = ""
			for (const word of words) {
				const candidate = current ? current + " " + word : word
				if (visibleLength(candidate) <= width) {
					current = candidate
				} else {
					if (current) lines.push(style + current + reset)
					current = word
				}
			}
			if (current) lines.push(style + current + reset)
		}

		return lines.length > 0 ? lines : [""]
	}
}

// ---------------------------------------------------------------------------
// Spacer
// ---------------------------------------------------------------------------

/** Emits n empty lines */
export class Spacer implements Component {
	constructor(private lines = 1) {}

	render(_width: number): string[] {
		return Array(this.lines).fill("")
	}
}

// ---------------------------------------------------------------------------
// VStack
// ---------------------------------------------------------------------------

/** Stacks children vertically */
export class VStack implements Component {
	private children: Component[] = []

	add(...components: Component[]): this {
		this.children.push(...components)
		return this
	}

	render(width: number): string[] {
		const lines: string[] = []
		for (const child of this.children) {
			lines.push(...child.render(width))
		}
		return lines
	}
}

// ---------------------------------------------------------------------------
// HStack
// ---------------------------------------------------------------------------

/**
 * Places children side by side.
 * Each child gets an equal share of the width (or you can specify fixed widths).
 */
export class HStack implements Component {
	constructor(
		private left: Component,
		private right: Component,
		private leftWidth?: number,
	) {}

	render(width: number): string[] {
		const lw = this.leftWidth ?? Math.floor(width / 2)
		const rw = width - lw

		const leftLines = this.left.render(lw)
		const rightLines = this.right.render(rw)

		const count = Math.max(leftLines.length, rightLines.length)
		const result: string[] = []

		for (let i = 0; i < count; i++) {
			const l = leftLines[i] ?? ""
			const r = rightLines[i] ?? ""
			// Pad left side to exact width
			result.push(padRight(stripAnsi(l).length > lw ? l.slice(0, lw) : l, lw, stripAnsi(l).length) + r)
		}

		return result
	}
}

// ---------------------------------------------------------------------------
// Box
// ---------------------------------------------------------------------------

/**
 * Draws a border around its children.
 *
 *   ┌──────────────┐
 *   │ child lines  │
 *   └──────────────┘
 */
export class Box implements Component {
	constructor(
		private child: Component,
		private options: { title?: string; style?: string } = {},
	) {}

	render(width: number): string[] {
		const { title = "", style = "" } = this.options
		const reset = style ? "\x1b[0m" : ""
		const innerWidth = width - 2 // 1 char left border + 1 char right border

		const inner = this.child.render(innerWidth)

		const topFill = title
			? "─" + title + "─".repeat(Math.max(0, innerWidth - title.length - 1))
			: "─".repeat(innerWidth)

		const top = style + "┌" + topFill + "┐" + reset
		const bottom = style + "└" + "─".repeat(innerWidth) + "┘" + reset

		const lines = [top]
		for (const line of inner) {
			const pad = "─" // won't be used — just showing how to pad
			const visible = visibleLength(line)
			const paddedLine = line + " ".repeat(Math.max(0, innerWidth - visible))
			lines.push(style + "│" + reset + paddedLine + style + "│" + reset)
		}
		lines.push(bottom)

		return lines
	}
}

// ---------------------------------------------------------------------------
// Container (root)
// ---------------------------------------------------------------------------

/**
 * The root component. Renders all children and supports a single overlay
 * (e.g., a modal dialog) that composites on top.
 */
export class Container implements Component {
	private children: Component[] = []
	private overlay: Component | null = null

	add(...components: Component[]): this {
		this.children.push(...components)
		return this
	}

	setOverlay(component: Component | null): void {
		this.overlay = component
	}

	render(width: number): string[] {
		const lines: string[] = []
		for (const child of this.children) {
			lines.push(...child.render(width))
		}

		// Overlay compositing: draw overlay centered on top of lines
		if (this.overlay) {
			const overlayWidth = Math.min(60, width - 4)
			const overlayLines = this.overlay.render(overlayWidth)
			const startRow = Math.floor((lines.length - overlayLines.length) / 2)
			const startCol = Math.floor((width - overlayWidth) / 2)
			const pad = " ".repeat(startCol)

			for (let i = 0; i < overlayLines.length; i++) {
				const row = startRow + i
				if (row >= 0 && row < lines.length) {
					lines[row] = pad + overlayLines[i]
				}
			}
		}

		return lines
	}
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Strip ANSI escape sequences to measure visible string length */
export function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b_[^]*?\x07/g, "")
}

/** Visible character count (excludes ANSI codes) */
export function visibleLength(s: string): number {
	return stripAnsi(s).length
}

/** Pad a string to the given visible width (fills with spaces) */
function padRight(s: string, targetWidth: number, currentVisible: number): string {
	return s + " ".repeat(Math.max(0, targetWidth - currentVisible))
}

// ---------------------------------------------------------------------------
// Demo — run with: npx tsx src/components.ts
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
	const root = new Container()

	root.add(
		new Text("\x1b[1mComponent System Demo\x1b[0m"),
		new Spacer(),
		new Box(
			new VStack()
				.add(new Text("This text is inside a box."))
				.add(new Text("It wraps at the box inner width."))
				.add(new Spacer())
				.add(new Text("\x1b[32mGreen text works too.\x1b[0m")),
			{ title: "Example Box", style: "\x1b[90m" },
		),
		new Spacer(),
		new HStack(new Text("Left column\nSecond line"), new Text("Right column\nSecond line")),
	)

	const width = process.stdout.columns || 80
	for (const line of root.render(width)) {
		console.log(line)
	}
}
