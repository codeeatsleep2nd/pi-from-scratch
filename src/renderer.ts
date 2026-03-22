/**
 * Step 02 — Differential Renderer
 *
 * Only redraws lines that changed between frames.
 * Import ANSI helpers from step 01 or inline them here.
 */

// ---------------------------------------------------------------------------
// ANSI helpers (inlined so each step is self-contained)
// ---------------------------------------------------------------------------

function moveCursorUp(n: number): string {
	return n > 0 ? `\x1b[${n}A` : ""
}
function moveCursorToLineStart(): string {
	return "\x1b[0G"
}
function clearLine(): string {
	return "\x1b[2K"
}
function beginSync(): string {
	return "\x1b[?2026h"
}
function endSync(): string {
	return "\x1b[?2026l"
}

// ---------------------------------------------------------------------------
// Differential renderer
// ---------------------------------------------------------------------------

export class DifferentialRenderer {
	/** Lines from the last render call. Used to diff against the new frame. */
	private previousLines: string[] = []

	/**
	 * Tracks the line index where the cursor is sitting after each render.
	 * -1 means nothing has been rendered yet (cursor is at its natural position).
	 *
	 * This is the key invariant: every render() call must leave the cursor at
	 * `lastChanged` (or `next.length - 1` if the frame shrank). The next render
	 * uses this to compute the exact cursor-up/down distance to reach firstChanged.
	 *
	 * The original bug: the code assumed the cursor was always at prev.length - 1
	 * after each render. But when only a line in the middle changed (e.g. the frame
	 * counter at line 1), the cursor was left at line 1, not at the bottom. The next
	 * render then moved the cursor up by the wrong amount, overshooting into content
	 * above the rendered block and producing ghost lines.
	 */
	private cursorLine = -1

	/**
	 * Render a new frame, writing only the lines that changed.
	 *
	 * @param lines  The complete set of lines to display.
	 * @param write  Output function — defaults to process.stdout.write.
	 * @returns      The ANSI string that was written (useful for testing).
	 */
	render(lines: string[], write: (s: string) => void = (s) => process.stdout.write(s)): string {
		const prev = this.previousLines
		const next = lines

		// Find the first line that differs
		let firstChanged = -1
		for (let i = 0; i < Math.max(prev.length, next.length); i++) {
			if (prev[i] !== next[i]) {
				firstChanged = i
				break
			}
		}

		// Nothing changed — skip the render entirely
		if (firstChanged === -1) return ""

		// Find the last line that differs (scan from the bottom)
		let lastChanged = firstChanged
		for (let i = Math.max(prev.length, next.length) - 1; i > firstChanged; i--) {
			if (prev[i] !== next[i]) {
				lastChanged = i
				break
			}
		}

		let out = beginSync()

		// ----------------------------------------------------------------
		// Move cursor from cursorLine to firstChanged
		// ----------------------------------------------------------------
		if (this.cursorLine === -1) {
			// Very first render — cursor is already at the right position
		} else {
			const delta = firstChanged - this.cursorLine
			if (delta < 0) {
				// firstChanged is above the cursor — move up
				out += moveCursorUp(-delta)
			} else if (delta > 0) {
				// firstChanged is below the cursor — move down
				// \x1b[{n}B moves cursor down n lines without scrolling
				out += `\x1b[${delta}B`
			}
			out += moveCursorToLineStart()
		}

		// ----------------------------------------------------------------
		// Write lines from firstChanged through lastChanged
		// ----------------------------------------------------------------
		for (let i = firstChanged; i <= lastChanged; i++) {
			out += clearLine()
			out += moveCursorToLineStart()
			if (i < next.length) {
				out += next[i]!
			}
			// Don't add a trailing newline on the very last line written
			if (i < lastChanged) {
				out += "\n"
			}
		}

		// Cursor is now sitting at lastChanged
		this.cursorLine = lastChanged

		// ----------------------------------------------------------------
		// If new frame is shorter, erase the extra lines at the bottom
		// ----------------------------------------------------------------
		if (next.length < prev.length) {
			for (let i = next.length; i < prev.length; i++) {
				out += "\n" + clearLine() + moveCursorToLineStart()
			}
			// Move cursor back up to the last line of the new frame
			out += moveCursorUp(prev.length - next.length)
			out += moveCursorToLineStart()
			this.cursorLine = next.length - 1
		}

		out += endSync()

		write(out)
		this.previousLines = [...next]
		return out
	}

	/** Reset state — useful when the terminal is resized or cleared externally */
	reset(): void {
		this.previousLines = []
		this.cursorLine = -1
	}

	get lineCount(): number {
		return this.previousLines.length
	}
}

// ---------------------------------------------------------------------------
// Demo — run with: npx tsx src/renderer.ts
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
	process.on("SIGINT", () => {
		process.stdout.write("\x1b[?25h\n") // show cursor
		process.exit(0)
	})

	process.stdout.write("\x1b[?25l") // hide cursor

	const renderer = new DifferentialRenderer()
	const items = ["Apple", "Banana", "Cherry", "Date", "Elderberry"]
	let selected = 0
	let frame = 0

	// Enable raw mode to capture arrow keys
	process.stdin.setRawMode(true)
	process.stdin.setEncoding("utf8")
	process.stdin.on("data", (key: string) => {
		if (key === "\x03") process.exit(0) // Ctrl+C
		if (key === "\x1b[A") selected = Math.max(0, selected - 1) // Up
		if (key === "\x1b[B") selected = Math.min(items.length - 1, selected + 1) // Down
	})

	setInterval(() => {
		frame++
		const lines = [
			"\x1b[1mDifferential Renderer Demo\x1b[0m",
			`\x1b[90mFrame: ${frame} — only changed lines redraw\x1b[0m`,
			"",
			...items.map((item, i) => (i === selected ? `\x1b[32m▶ ${item}\x1b[0m` : `  ${item}`)),
			"",
			"\x1b[90m↑/↓ arrows to move, Ctrl+C to quit\x1b[0m",
		]
		renderer.render(lines)
	}, 50)
}
