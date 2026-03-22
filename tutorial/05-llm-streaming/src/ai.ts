/**
 * Step 05 — LLM Streaming API
 *
 * Unified types and stream()/complete() functions.
 * Providers are injected (not hardcoded) so you can swap them.
 */

import { EventStream } from "./event-stream.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Message {
	role: "user" | "assistant"
	content: string
}

export interface ToolCall {
	id: string
	name: string
	arguments: Record<string, unknown>
}

export interface ToolResult {
	toolCallId: string
	content: string
}

export interface Tool {
	name: string
	description: string
	/** JSON Schema for the parameters */
	parameters: Record<string, unknown>
}

export interface Context {
	systemPrompt?: string
	messages: Message[]
	tools?: Tool[]
}

export interface Usage {
	inputTokens: number
	outputTokens: number
	cost?: number
}

export interface AssistantMessage {
	role: "assistant"
	content: string
	toolCalls: ToolCall[]
	usage: Usage
	stopReason: "stop" | "length" | "toolUse" | "error"
	errorMessage?: string
}

// ---------------------------------------------------------------------------
// Event stream types
// ---------------------------------------------------------------------------

export type AssistantMessageEvent =
	| { type: "start" }
	| { type: "text"; content: string }
	| { type: "toolCall"; toolCall: ToolCall }
	| { type: "done"; message: AssistantMessage }
	| { type: "error"; error: Error }

function isDoneEvent(e: AssistantMessageEvent): boolean {
	return e.type === "done" || e.type === "error"
}

function getResult(e: AssistantMessageEvent): AssistantMessage {
	if (e.type === "done") return e.message
	if (e.type === "error") throw e.error
	throw new Error("Not a terminal event")
}

export class AssistantMessageEventStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(isDoneEvent, getResult)
	}
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface Provider {
	name: string
	stream(context: Context, options?: StreamOptions): Promise<AssistantMessageEventStream>
}

export interface StreamOptions {
	maxTokens?: number
	temperature?: number
	signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// stream() and complete()
// ---------------------------------------------------------------------------

/**
 * Start a streaming LLM call.
 * Returns an EventStream you can iterate over for events, or await .result() for the final message.
 */
export async function stream(
	provider: Provider,
	context: Context,
	options?: StreamOptions,
): Promise<AssistantMessageEventStream> {
	return provider.stream(context, options)
}

/**
 * Convenience: stream and collect the final AssistantMessage (blocks until done).
 */
export async function complete(
	provider: Provider,
	context: Context,
	options?: StreamOptions,
): Promise<AssistantMessage> {
	const s = await stream(provider, context, options)
	return s.result()
}

// ---------------------------------------------------------------------------
// Demo — run with: npx tsx src/ai.ts (requires API key)
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
	// Lazy import so the demo only runs when called directly
	if (process.env["ANTHROPIC_API_KEY"]) {
		const { AnthropicProvider } = await import("./providers/anthropic.js")
		const provider = new AnthropicProvider()

		console.log("Streaming response:\n")
		const s = await stream(provider, {
			messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
		})

		for await (const event of s) {
			if (event.type === "text") process.stdout.write(event.content)
			if (event.type === "done") {
				console.log("\n\nDone!")
				console.log(`Tokens: ${event.message.usage.inputTokens} in / ${event.message.usage.outputTokens} out`)
			}
		}
	} else if (process.env["OPENAI_API_KEY"]) {
		const { OpenAIProvider } = await import("./providers/openai.js")
		const provider = new OpenAIProvider()

		console.log("Streaming response:\n")
		const s = await stream(provider, {
			messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
		})

		for await (const event of s) {
			if (event.type === "text") process.stdout.write(event.content)
			if (event.type === "done") {
				console.log("\n\nDone!")
				console.log(`Tokens: ${event.message.usage.inputTokens} in / ${event.message.usage.outputTokens} out`)
			}
		}
	} else {
		console.log("No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.")
	}
}
