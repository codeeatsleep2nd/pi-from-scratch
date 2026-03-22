/**
 * Step 08 — Write Tool
 *
 * Write the entire contents of a file, creating parent directories as needed.
 */

import { writeFile, mkdir } from "fs/promises"
import { dirname } from "path"
import type { ToolDefinition, ToolResult } from "../../../06-tool-calling/src/tools.js"

interface WriteArgs {
	path: string
	content: string
}

export const writeTool: ToolDefinition<WriteArgs> = {
	name: "write",
	description:
		"Write content to a file, creating it if it doesn't exist and overwriting if it does. " +
		"Use this for new files or complete rewrites. For small changes to existing files, prefer the edit tool.",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Absolute or relative path to the file",
			},
			content: {
				type: "string",
				description: "The complete file content to write",
			},
		},
		required: ["path", "content"],
	},
	async execute({ path, content }): Promise<ToolResult> {
		try {
			// Create parent directories if they don't exist
			await mkdir(dirname(path), { recursive: true })

			await writeFile(path, content, "utf8")

			const lines = content.split("\n").length
			const sizeKB = (Buffer.byteLength(content, "utf8") / 1024).toFixed(1)
			return {
				content: `Wrote ${lines} lines (${sizeKB}KB) to ${path}`,
				isError: false,
			}
		} catch (err) {
			return {
				content: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
				isError: true,
			}
		}
	},
}
