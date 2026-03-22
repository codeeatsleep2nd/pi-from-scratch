/**
 * Step 10 — Interactive Mode
 *
 * Wires together: TUI + agent loop + session persistence
 * into a live coding agent you can run in your terminal.
 *
 * Run with: npx tsx src/interactive.ts
 * Requires: ANTHROPIC_API_KEY or OPENAI_API_KEY
 */

import { DifferentialRenderer } from "./renderer.js"
import { parseKey, matchesKey } from "./keys.js"
import { agentLoop, type ConversationMessage } from "./agent-loop.js"
import { readTool } from "./tools/read.js"
import { writeTool } from "./tools/write.js"
import { bashTool } from "./tools/bash.js"
import { editTool } from "./tools/edit.js"
import { SessionManager } from "./session.js"
import type { Provider } from "./ai.js"
import { join } from "path"
import { homedir } from "os"

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AppState {
	messages: ConversationMessage[]
	input: string
	cursor: number // cursor position in input string
	status: string // status bar text
	isRunning: boolean
	abortController: AbortController | null
}

const state: AppState = {
	messages: [],
	input: "",
	cursor: 0,
	status: "Type a message and press Enter to send. Ctrl+C to exit.",
	isRunning: false,
	abortController: null,
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const renderer = new DifferentialRenderer()

function getTerminalWidth(): number {
	return process.stdout.columns || 80
}

function render(): void {
	const width = getTerminalWidth()
	const lines: string[] = []

	// Header
	lines.push("\x1b[1m\x1b[36m Pi Coding Agent\x1b[0m")
	lines.push("\x1b[90m" + "─".repeat(width) + "\x1b[0m")

	// Messages
	for (const msg of state.messages) {
		if (msg.role === "user") {
			lines.push("")
			lines.push(`\x1b[34m\x1b[1mYou:\x1b[0m`)
			for (const line of msg.content.split("\n")) {
				lines.push(`  ${line}`)
			}
		} else if (msg.role === "assistant") {
			lines.push("")
			lines.push(`\x1b[32m\x1b[1mAssistant:\x1b[0m`)
			const content = msg.content || "\x1b[90m(thinking...)\x1b[0m"
			for (const line of content.split("\n")) {
				lines.push(`  ${line}`)
			}
		} else if (msg.role === "tool_result") {
			const icon = msg.isError ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m"
			lines.push(`  ${icon} \x1b[90mTool result: ${msg.content.slice(0, 80).replace(/\n/g, " ")}\x1b[0m`)
		}
	}

	// Running indicator
	if (state.isRunning) {
		lines.push("")
		lines.push(`\x1b[33m⟳ Running... (Escape to abort)\x1b[0m`)
	}

	// Separator
	lines.push("")
	lines.push("\x1b[90m" + "─".repeat(width) + "\x1b[0m")

	// Input
	const inputPrompt = "\x1b[1mYou: \x1b[0m"
	const displayInput = state.input + (state.isRunning ? "" : "\x1b[7m \x1b[0m") // cursor block
	lines.push(inputPrompt + displayInput)

	// Status bar
	lines.push("\x1b[90m" + state.status + "\x1b[0m")

	renderer.render(lines)
}

// ---------------------------------------------------------------------------
// Agent execution
// ---------------------------------------------------------------------------

async function sendMessage(provider: Provider): Promise<void> {
	const userInput = state.input.trim()
	if (!userInput || state.isRunning) return

	// Add user message to conversation
	state.messages.push({ role: "user", content: userInput })
	state.input = ""
	state.cursor = 0
	state.isRunning = true
	state.status = "Running... (Escape to abort)"
	render()

	// Set up abort controller
	const controller = new AbortController()
	state.abortController = controller

	// Add a placeholder for the assistant response
	const assistantMsg: ConversationMessage = {
		role: "assistant",
		content: "",
		toolCalls: [],
		usage: { inputTokens: 0, outputTokens: 0 },
		stopReason: "stop",
	}
	state.messages.push(assistantMsg)

	try {
		const loop = agentLoop(state.messages.slice(0, -1), {
			// Don't include the placeholder
			provider,
			tools: [readTool as any, writeTool as any, bashTool as any, editTool as any],
			systemPrompt:
				"You are a helpful coding assistant. You can read files, write files, execute bash commands, and edit files. " +
				`Current working directory: ${process.cwd()}`,
			signal: controller.signal,
		})

		for await (const event of loop) {
			if (event.type === "message_update") {
				assistantMsg.content += event.text
				render()
			} else if (event.type === "tool_execution_start") {
				state.status = `Running tool: ${event.toolName}...`
				render()
			} else if (event.type === "tool_execution_end") {
				// Add tool result to messages for display
				state.messages.push({
					role: "tool_result",
					toolCallId: event.toolCallId,
					content: event.result.content.slice(0, 200),
					isError: event.result.isError,
				})
				state.status = "Running..."
				render()
			}
		}

		// Get final messages from loop result
		const finalMessages = await loop.result()
		// Replace our working copy with the loop's final messages
		// (The loop accumulates all messages including tool results)
		state.messages = finalMessages

		const usage = (assistantMsg as any).usage
		if (usage) {
			state.status = `Done — ${usage.inputTokens + usage.outputTokens} tokens. Enter to send, Ctrl+C to exit.`
		} else {
			state.status = "Done. Enter to send, Ctrl+C to exit."
		}
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err)
		if (errorMsg.toLowerCase().includes("aborted") || err instanceof Error && err.name.includes("Abort")) {
			assistantMsg.content = (assistantMsg.content || "") + "\n\x1b[33m[Aborted]\x1b[0m"
			state.status = "Aborted. Enter to send, Ctrl+C to exit."
		} else {
			assistantMsg.content = `\x1b[31mError: ${errorMsg}\x1b[0m`
			state.status = "Error occurred. Enter to send, Ctrl+C to exit."
		}
	} finally {
		state.isRunning = false
		state.abortController = null
		render()
	}
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

function handleKey(raw: string, provider: Provider): void {
	const key = parseKey(raw)

	if (key === "ctrl+c") {
		cleanup()
		process.exit(0)
	}

	if (key === "escape" && state.isRunning) {
		state.abortController?.abort()
		state.status = "Aborting..."
		render()
		return
	}

	if (state.isRunning) return // Ignore input while running (except Escape/Ctrl+C)

	if (key === "enter" || key === "ctrl+j") {
		sendMessage(provider) // Fire and forget — state.isRunning prevents re-entry
		return
	}

	if (key === "backspace") {
		if (state.cursor > 0) {
			state.input = state.input.slice(0, state.cursor - 1) + state.input.slice(state.cursor)
			state.cursor--
		}
		render()
		return
	}

	if (key === "delete") {
		if (state.cursor < state.input.length) {
			state.input = state.input.slice(0, state.cursor) + state.input.slice(state.cursor + 1)
		}
		render()
		return
	}

	if (key === "arrow_left") {
		state.cursor = Math.max(0, state.cursor - 1)
		render()
		return
	}

	if (key === "arrow_right") {
		state.cursor = Math.min(state.input.length, state.cursor + 1)
		render()
		return
	}

	if (key === "home" || key === "ctrl+a") {
		state.cursor = 0
		render()
		return
	}

	if (key === "end" || key === "ctrl+e") {
		state.cursor = state.input.length
		render()
		return
	}

	// Printable character
	if (raw.length === 1 && raw.charCodeAt(0) >= 0x20) {
		state.input = state.input.slice(0, state.cursor) + raw + state.input.slice(state.cursor)
		state.cursor++
		render()
	}
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function cleanup(): void {
	process.stdout.write("\x1b[?25h\n") // show cursor
	if (process.stdin.isTTY) process.stdin.setRawMode(false)
	process.stdin.pause()
}

async function main(): Promise<void> {
	// Pick provider
	let provider: Provider

	if (process.env["ANTHROPIC_API_KEY"]) {
		const { AnthropicProvider } = await import("./providers/anthropic.js")
		provider = new AnthropicProvider()
		state.status = "Using Anthropic. Type a message and press Enter."
	} else if (process.env["OPENAI_API_KEY"]) {
		const { OpenAIProvider } = await import("./providers/openai.js")
		provider = new OpenAIProvider()
		state.status = "Using OpenAI. Type a message and press Enter."
	} else {
		console.error("Error: Set ANTHROPIC_API_KEY or OPENAI_API_KEY to use this tool.")
		process.exit(1)
	}

	// Set up terminal
	process.on("exit", cleanup)
	process.on("SIGINT", () => {
		cleanup()
		process.exit(0)
	})

	if (process.stdin.isTTY) process.stdin.setRawMode(true)
	process.stdin.resume()
	process.stdin.setEncoding("utf8")
	process.stdout.write("\x1b[?25l") // hide cursor
	process.stdout.write("\x1b[2J\x1b[H") // clear screen

	// Initial render
	render()

	// Key input loop
	process.stdin.on("data", (raw: string) => {
		handleKey(raw, provider)
	})
}

main().catch((err) => {
	console.error("Fatal error:", err)
	process.exit(1)
})
