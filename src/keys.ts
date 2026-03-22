/**
 * Step 03 — Key Input Parsing
 *
 * Parse raw bytes from stdin (in raw mode) into named key strings.
 * Handles common escape sequences and control characters.
 */

// ---------------------------------------------------------------------------
// Key name table
// ---------------------------------------------------------------------------

/** Map raw byte sequences to key names */
const KEY_MAP: Record<string, string> = {
	// Control characters
	"\x01": "ctrl+a",
	"\x02": "ctrl+b",
	"\x03": "ctrl+c",
	"\x04": "ctrl+d",
	"\x05": "ctrl+e",
	"\x06": "ctrl+f",
	"\x07": "ctrl+g",
	"\x08": "ctrl+h",
	"\x09": "tab",
	"\x0a": "enter",
	"\x0b": "ctrl+k",
	"\x0c": "ctrl+l",
	"\x0d": "enter", // CR
	"\x0e": "ctrl+n",
	"\x0f": "ctrl+o",
	"\x10": "ctrl+p",
	"\x11": "ctrl+q",
	"\x12": "ctrl+r",
	"\x13": "ctrl+s",
	"\x14": "ctrl+t",
	"\x15": "ctrl+u",
	"\x16": "ctrl+v",
	"\x17": "ctrl+w",
	"\x18": "ctrl+x",
	"\x19": "ctrl+y",
	"\x1a": "ctrl+z",
	"\x1b": "escape",
	"\x7f": "backspace",

	// Arrow keys (VT100)
	"\x1b[A": "arrow_up",
	"\x1b[B": "arrow_down",
	"\x1b[C": "arrow_right",
	"\x1b[D": "arrow_left",

	// Home / End
	"\x1b[H": "home",
	"\x1b[F": "end",
	"\x1b[1~": "home",
	"\x1b[4~": "end",
	"\x1b[7~": "home",
	"\x1b[8~": "end",

	// Page Up / Down
	"\x1b[5~": "page_up",
	"\x1b[6~": "page_down",

	// Delete / Insert
	"\x1b[3~": "delete",
	"\x1b[2~": "insert",

	// Shift+Tab
	"\x1b[Z": "shift+tab",

	// Function keys
	"\x1bOP": "f1",
	"\x1bOQ": "f2",
	"\x1bOR": "f3",
	"\x1bOS": "f4",
	"\x1b[15~": "f5",
	"\x1b[17~": "f6",
	"\x1b[18~": "f7",
	"\x1b[19~": "f8",
	"\x1b[20~": "f9",
	"\x1b[21~": "f10",
	"\x1b[23~": "f11",
	"\x1b[24~": "f12",

	// Alt+key sequences (Meta)
	"\x1ba": "alt+a",
	"\x1bb": "alt+b",
	"\x1bd": "alt+d",
	"\x1bf": "alt+f",

	// Ctrl+arrow (common terminal sequences)
	"\x1b[1;5A": "ctrl+arrow_up",
	"\x1b[1;5B": "ctrl+arrow_down",
	"\x1b[1;5C": "ctrl+arrow_right",
	"\x1b[1;5D": "ctrl+arrow_left",
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw stdin data chunk into a key name.
 *
 * Returns the key name if recognized, or the raw data as-is for printable chars.
 */
export function parseKey(data: string): string {
	// Kitty protocol: \x1b[{keycode};{modifier}u  (simplified check)
	const kittyMatch = data.match(/^\x1b\[(\d+);(\d+)u$/)
	if (kittyMatch) {
		return parseKittyKey(Number(kittyMatch[1]), Number(kittyMatch[2]))
	}

	// Check exact match in key map (longest sequence wins — already ordered by length)
	if (data in KEY_MAP) {
		return KEY_MAP[data]!
	}

	// Printable ASCII (space through ~)
	if (data.length === 1 && data.charCodeAt(0) >= 0x20 && data.charCodeAt(0) <= 0x7e) {
		return data
	}

	// Multi-byte UTF-8 characters (emoji, accented letters, etc.)
	if (data.length > 0 && data.charCodeAt(0) > 0x7f) {
		return data
	}

	// Unknown sequence — return hex representation for debugging
	return `<unknown:${[...data].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ")}>`
}

/**
 * Parse a Kitty protocol key event.
 * Modifier bits: 1=shift, 2=alt, 4=ctrl (add 1 to the bitmask)
 */
function parseKittyKey(keycode: number, modifiers: number): string {
	// Modifiers are encoded as (shift|alt|ctrl)+1
	const mod = modifiers - 1
	const shift = (mod & 1) !== 0
	const alt = (mod & 2) !== 0
	const ctrl = (mod & 4) !== 0

	let base = ""

	// Map common keycodes
	if (keycode >= 97 && keycode <= 122) {
		base = String.fromCharCode(keycode) // a-z
	} else if (keycode >= 65 && keycode <= 90) {
		base = String.fromCharCode(keycode).toLowerCase() // A-Z
	} else {
		const specialKeys: Record<number, string> = {
			13: "enter",
			27: "escape",
			127: "backspace",
			9: "tab",
			32: "space",
		}
		base = specialKeys[keycode] ?? `key${keycode}`
	}

	const parts: string[] = []
	if (ctrl) parts.push("ctrl")
	if (alt) parts.push("alt")
	if (shift && base.length === 1) parts.push("shift")
	parts.push(base)

	return parts.join("+")
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

/**
 * Check if a raw stdin chunk matches any of the given key names.
 *
 * Usage:
 *   matchesKey(data, "ctrl+c")                  → Ctrl+C
 *   matchesKey(data, "arrow_up", "arrow_down")  → either arrow
 */
export function matchesKey(data: string, ...keys: string[]): boolean {
	const parsed = parseKey(data)
	return keys.includes(parsed)
}

/**
 * Check if data is a single printable character (not a control key).
 */
export function isPrintable(data: string): boolean {
	const key = parseKey(data)
	return key.length === 1 || (key.length > 1 && !key.includes("+") && !key.startsWith("<"))
}

// ---------------------------------------------------------------------------
// Demo — run with: npx tsx src/keys.ts
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
	process.stdin.setRawMode(true)
	process.stdin.setEncoding("utf8")
	process.stdout.write("\x1b[2J\x1b[H") // clear screen

	console.log("Key Input Demo — press keys to see their names\n")
	console.log("Ctrl+C to quit\n")

	process.stdin.on("data", (raw: string) => {
		const key = parseKey(raw)

		if (key === "ctrl+c") {
			process.stdin.setRawMode(false)
			process.exit(0)
		}

		const hex = [...raw].map((c) => `0x${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(" ")
		console.log(`  raw: ${JSON.stringify(raw).padEnd(20)} hex: ${hex.padEnd(30)} → ${key}`)
	})
}
