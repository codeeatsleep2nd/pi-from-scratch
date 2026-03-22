/**
 * Step 08 — Bash Tool
 *
 * Execute shell commands with timeout and output truncation.
 */

import { spawn } from "child_process"
import type { ToolDefinition, ToolResult } from "../../../06-tool-calling/src/tools.js"

const MAX_OUTPUT_BYTES = 50 * 1024 // 50KB per stream
const DEFAULT_TIMEOUT_MS = 30_000 // 30 seconds

interface BashArgs {
	command: string
	timeout?: number
	cwd?: string
}

export const bashTool: ToolDefinition<BashArgs> = {
	name: "bash",
	description:
		"Execute a shell command and return stdout and stderr. " +
		"Commands have a 30-second timeout by default. " +
		"Output is truncated to 50KB. " +
		"Do not use for interactive commands.",
	parameters: {
		type: "object",
		properties: {
			command: {
				type: "string",
				description: "The shell command to execute",
			},
			timeout: {
				type: "number",
				description: "Timeout in milliseconds (default: 30000)",
			},
			cwd: {
				type: "string",
				description: "Working directory for the command",
			},
		},
		required: ["command"],
	},
	async execute({ command, timeout = DEFAULT_TIMEOUT_MS, cwd }, signal): Promise<ToolResult> {
		return runCommand(command, { timeout, cwd, signal })
	},
}

export interface CommandResult {
	stdout: string
	stderr: string
	exitCode: number | null
	timedOut: boolean
}

export async function runCommand(
	command: string,
	options: { timeout?: number; cwd?: string; signal?: AbortSignal } = {},
): Promise<ToolResult> {
	const { timeout = DEFAULT_TIMEOUT_MS, cwd, signal } = options

	return new Promise<ToolResult>((resolve) => {
		const stdoutChunks: Buffer[] = []
		const stderrChunks: Buffer[] = []
		let stdoutBytes = 0
		let stderrBytes = 0
		let stdoutTruncated = false
		let stderrTruncated = false
		let timedOut = false

		const child = spawn("sh", ["-c", command], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		})

		const timer = setTimeout(() => {
			timedOut = true
			child.kill("SIGKILL")
		}, timeout)

		// Handle external abort
		const onAbort = () => {
			child.kill("SIGKILL")
		}
		signal?.addEventListener("abort", onAbort)

		child.stdout.on("data", (chunk: Buffer) => {
			if (stdoutBytes < MAX_OUTPUT_BYTES) {
				stdoutChunks.push(chunk)
				stdoutBytes += chunk.length
			} else {
				stdoutTruncated = true
			}
		})

		child.stderr.on("data", (chunk: Buffer) => {
			if (stderrBytes < MAX_OUTPUT_BYTES) {
				stderrChunks.push(chunk)
				stderrBytes += chunk.length
			} else {
				stderrTruncated = true
			}
		})

		child.on("close", (exitCode) => {
			clearTimeout(timer)
			signal?.removeEventListener("abort", onAbort)

			let stdout = Buffer.concat(stdoutChunks).toString("utf8")
			let stderr = Buffer.concat(stderrChunks).toString("utf8")

			if (stdoutTruncated) stdout += "\n[stdout truncated]"
			if (stderrTruncated) stderr += "\n[stderr truncated]"

			if (timedOut) {
				resolve({
					content: `Command timed out after ${timeout}ms\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
					isError: true,
				})
				return
			}

			if (signal?.aborted) {
				resolve({ content: "Command aborted", isError: true })
				return
			}

			const parts: string[] = []
			if (stdout.trim()) parts.push(`stdout:\n${stdout}`)
			if (stderr.trim()) parts.push(`stderr:\n${stderr}`)
			if (exitCode !== 0) parts.push(`exit code: ${exitCode}`)

			const content = parts.join("\n\n") || "(no output)"
			const isError = exitCode !== 0

			resolve({ content, isError })
		})

		child.on("error", (err) => {
			clearTimeout(timer)
			signal?.removeEventListener("abort", onAbort)
			resolve({ content: `Failed to run command: ${err.message}`, isError: true })
		})
	})
}
