/**
 * Step 08 — Edit Tool
 *
 * Replace an exact string in a file. More precise than full rewrites.
 */

import { readFile, writeFile } from "fs/promises"
import { access } from "fs/promises"
import type { ToolDefinition, ToolResult } from "../../../06-tool-calling/src/tools.js"

interface EditArgs {
	path: string
	oldString: string
	newString: string
}

export const editTool: ToolDefinition<EditArgs> = {
	name: "edit",
	description:
		"Replace an exact string in a file with new content. " +
		"The oldString must appear exactly once in the file — use enough context to make it unique. " +
		"If the string is not found, the tool returns an error. " +
		"Prefer this over the write tool for making targeted changes to existing files.",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the file to edit",
			},
			oldString: {
				type: "string",
				description:
					"The exact string to find and replace. Must be unique in the file. " +
					"Include surrounding lines for context if needed.",
			},
			newString: {
				type: "string",
				description: "The replacement string",
			},
		},
		required: ["path", "oldString", "newString"],
	},
	async execute({ path, oldString, newString }): Promise<ToolResult> {
		// Check file exists
		try {
			await access(path)
		} catch {
			return { content: `File not found: ${path}`, isError: true }
		}

		let content: string
		try {
			content = await readFile(path, "utf8")
		} catch (err) {
			return { content: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`, isError: true }
		}

		// Check occurrence count
		const occurrences = countOccurrences(content, oldString)

		if (occurrences === 0) {
			// Provide a helpful error with context
			const suggestion = findSimilarLine(content, oldString)
			let msg = `String not found in ${path}.\n\nSearched for:\n${oldString}`
			if (suggestion) {
				msg += `\n\nDid you mean (line ${suggestion.lineNumber}):\n${suggestion.line}`
			}
			return { content: msg, isError: true }
		}

		if (occurrences > 1) {
			const positions = findAllPositions(content, oldString)
			return {
				content:
					`String appears ${occurrences} times in ${path} — it must be unique for a safe edit.\n` +
					`Found at lines: ${positions.map((p) => p.lineNumber).join(", ")}\n` +
					`Add more surrounding context to make it unique.`,
				isError: true,
			}
		}

		// Exactly one match — perform the replacement
		const newContent = content.replace(oldString, newString)

		try {
			await writeFile(path, newContent, "utf8")
		} catch (err) {
			return { content: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`, isError: true }
		}

		const linesChanged = Math.abs(newString.split("\n").length - oldString.split("\n").length)
		return {
			content: `Edited ${path} (${linesChanged === 0 ? "same line count" : `${linesChanged > 0 ? "+" : ""}${linesChanged} lines`})`,
			isError: false,
		}
	},
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countOccurrences(text: string, needle: string): number {
	let count = 0
	let pos = 0
	while ((pos = text.indexOf(needle, pos)) !== -1) {
		count++
		pos += needle.length
	}
	return count
}

function findAllPositions(text: string, needle: string): { lineNumber: number; col: number }[] {
	const positions: { lineNumber: number; col: number }[] = []
	let pos = 0
	while ((pos = text.indexOf(needle, pos)) !== -1) {
		const before = text.slice(0, pos)
		const lineNumber = before.split("\n").length
		const lastNewline = before.lastIndexOf("\n")
		const col = pos - lastNewline
		positions.push({ lineNumber, col })
		pos += needle.length
	}
	return positions
}

/**
 * Find a line in the file that's similar to the first line of the search string.
 * Helps the LLM recover when it has whitespace/newline differences.
 */
function findSimilarLine(
	content: string,
	needle: string,
): { line: string; lineNumber: number } | null {
	const firstSearchLine = needle.split("\n")[0]?.trim()
	if (!firstSearchLine) return null

	const lines = content.split("\n")
	for (let i = 0; i < lines.length; i++) {
		if (lines[i]?.trim() === firstSearchLine) {
			return { line: lines[i]!, lineNumber: i + 1 }
		}
	}
	return null
}
