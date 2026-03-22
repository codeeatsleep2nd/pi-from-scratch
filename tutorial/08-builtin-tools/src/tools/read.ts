/**
 * Step 08 — Read Tool
 *
 * Read files with truncation, offset/limit, and image support.
 */

import { readFile, access } from "fs/promises"
import { extname } from "path"
import type { ToolDefinition, ToolResult } from "../tools.js"

const MAX_BYTES = 100 * 1024 // 100KB
const MAX_LINES = 3000

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"])
const BINARY_EXTENSIONS = new Set([".zip", ".tar", ".gz", ".exe", ".bin", ".so", ".dylib", ".dll", ".pdf"])

interface ReadArgs {
	path: string
	offset?: number
	limit?: number
}

export const readTool: ToolDefinition<ReadArgs> = {
	name: "read",
	description:
		"Read the contents of a file. For text files, returns the content truncated to 3000 lines or 100KB. " +
		"Use offset and limit to read a specific range of lines. " +
		"For image files, returns a description.",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Absolute or relative path to the file",
			},
			offset: {
				type: "number",
				description: "Line number to start reading from (1-indexed). Default: 1.",
			},
			limit: {
				type: "number",
				description: "Maximum number of lines to return.",
			},
		},
		required: ["path"],
	},
	async execute({ path, offset = 1, limit }): Promise<ToolResult> {
		// Check existence
		try {
			await access(path)
		} catch {
			return { content: `File not found: ${path}`, isError: true }
		}

		const ext = extname(path).toLowerCase()

		// Binary files we can't read as text
		if (BINARY_EXTENSIONS.has(ext)) {
			return { content: `Cannot read binary file: ${path} (${ext})`, isError: true }
		}

		// Images — return metadata
		if (IMAGE_EXTENSIONS.has(ext)) {
			try {
				const buffer = await readFile(path)
				const sizeKB = (buffer.length / 1024).toFixed(1)
				return {
					content: `Image file: ${path}\nFormat: ${ext.slice(1).toUpperCase()}\nSize: ${sizeKB}KB`,
					isError: false,
				}
			} catch (err) {
				return { content: `Failed to read image: ${err instanceof Error ? err.message : String(err)}`, isError: true }
			}
		}

		// Text file
		try {
			const buffer = await readFile(path)

			if (buffer.length > MAX_BYTES * 2) {
				// Truncate at byte level first for very large files
				const truncated = buffer.slice(0, MAX_BYTES).toString("utf8")
				return {
					content: truncated + `\n\n[File truncated: ${(buffer.length / 1024).toFixed(0)}KB total, showing first 100KB]`,
					isError: false,
				}
			}

			const text = buffer.toString("utf8")
			const allLines = text.split("\n")
			const totalLines = allLines.length

			// Apply offset (1-indexed → 0-indexed)
			const startIdx = Math.max(0, offset - 1)
			const endIdx = limit != null ? Math.min(startIdx + limit, totalLines) : Math.min(startIdx + MAX_LINES, totalLines)

			const selectedLines = allLines.slice(startIdx, endIdx)

			let content = selectedLines.join("\n")

			// Add truncation note
			const shownLines = endIdx - startIdx
			if (totalLines > shownLines) {
				content +=
					`\n\n[File has ${totalLines} lines total; showing lines ${startIdx + 1}–${endIdx}` +
					(endIdx < totalLines ? `. Use offset=${endIdx + 1} to read more.` : ".") +
					"]"
			}

			return { content, isError: false }
		} catch (err) {
			return { content: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`, isError: true }
		}
	},
}
