/**
 * Step 01 — Terminal Basics
 *
 * Minimal terminal control: raw mode, ANSI sequences, and a simple render loop.
 */

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

/** Move cursor up n lines */
export function moveCursorUp(n: number): string {
	if (n <= 0) return ""
	return `\x1b[${n}A`
}

/** Move cursor to column 0 of the current line */
export function moveCursorToLineStart(): string {
	return "\x1b[0G"
}

/** Clear from cursor to end of line */
export function clearLine(): string {
	return "\x1b[2K"
}

/** Hide the terminal cursor */
export function hideCursor(): string {
	return "\x1b[?25l"
}

/** Show the terminal cursor */
export function showCursor(): string {
	return "\x1b[?25h"
}

/** Begin synchronized output — terminal buffers updates and paints atomically */
export function beginSync(): string {
	return "\x1b[?2026h"
}

/** End synchronized output — flush the buffer to screen */
export function endSync(): string {
	return "\x1b[?2026l"
}

/** ANSI color codes for basic styling */
export const Color = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	gray: "\x1b[90m",
} as const

// ---------------------------------------------------------------------------
// Raw mode
// ---------------------------------------------------------------------------

let rawModeEnabled = false

/**
 * Enable raw mode on stdin: keypress events are delivered immediately,
 * no line-buffering, no echo, no signal processing.
 */
export function enableRawMode(): void {
	if (rawModeEnabled) return
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true)
	}
	process.stdin.resume()
	process.stdin.setEncoding("utf8")
	rawModeEnabled = true
}

/**
 * Restore normal (cooked) terminal mode.
 * Always call this on exit — otherwise your shell becomes unusable.
 */
export function disableRawMode(): void {
	if (!rawModeEnabled) return
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false)
	}
	process.stdin.pause()
	rawModeEnabled = false
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Write a string to stdout (no automatic newline) */
export function write(text: string): void {
	process.stdout.write(text)
}

/** Write a string followed by a newline */
export function writeLine(text: string): void {
	process.stdout.write(text + "\n")
}

// ---------------------------------------------------------------------------
// Simple render loop
// ---------------------------------------------------------------------------

/**
 * Naively re-render a list of lines by:
 * 1. Moving the cursor up to the first rendered line
 * 2. Clearing each line
 * 3. Writing the new content
 *
 * This is the "dumb" approach — step 02 replaces it with differential rendering.
 */
let lastLineCount = 0

export function renderLines(lines: string[]): void {
	let out = beginSync()

	// Move cursor up to the top of the previously rendered block
	if (lastLineCount > 0) {
		out += moveCursorUp(lastLineCount)
		out += moveCursorToLineStart()
	}

	// Clear old lines and write new ones
	for (let i = 0; i < Math.max(lines.length, lastLineCount); i++) {
		out += clearLine()
		out += moveCursorToLineStart()
		if (i < lines.length) {
			out += lines[i]
		}
		if (i < lines.length - 1) {
			out += "\n"
		}
	}

	out += endSync()
	write(out)

	lastLineCount = lines.length
}

// ---------------------------------------------------------------------------
// Demo — run with: npx tsx src/terminal.ts
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
	// Restore raw mode on exit
	process.on("exit", () => {
		disableRawMode()
		write(showCursor())
	})
	process.on("SIGINT", () => process.exit(0))

	enableRawMode()
	write(hideCursor())

	// Listen for Ctrl+C
	process.stdin.on("data", (key: string) => {
		if (key === "\x03") process.exit(0) // Ctrl+C
	})

	let count = 0
	const startTime = Date.now()

	setInterval(() => {
		const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
		const bar = "█".repeat(count % 20) + "░".repeat(20 - (count % 20))

		renderLines([
			`${Color.cyan}${Color.bold}Pi Terminal Demo${Color.reset}`,
			``,
			`  Elapsed:  ${Color.yellow}${elapsed}s${Color.reset}`,
			`  Counter:  ${Color.green}${count}${Color.reset}`,
			`  Progress: ${Color.blue}[${bar}]${Color.reset}`,
			``,
			`  ${Color.gray}Press Ctrl+C to exit${Color.reset}`,
		])

		count++
	}, 100)
}
