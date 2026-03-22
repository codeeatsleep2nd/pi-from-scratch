/**
 * Step 05 — Anthropic Provider
 *
 * Wraps the @anthropic-ai/sdk to implement the Provider interface.
 */

import Anthropic from "@anthropic-ai/sdk"
import type { Provider, Context, StreamOptions, ToolCall, AssistantMessage } from "../ai.js"
import { AssistantMessageEventStream } from "../ai.js"

export class AnthropicProvider implements Provider {
	name = "anthropic"
	private model: string

	constructor(model = "claude-haiku-4-5-20251001") {
		this.model = model
	}

	async stream(context: Context, options: StreamOptions = {}): Promise<AssistantMessageEventStream> {
		const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })
		const eventStream = new AssistantMessageEventStream()

		// Start streaming in the background (don't block the caller)
		;(async () => {
			try {
				eventStream.push({ type: "start" })

				// Convert our generic messages to Anthropic's format
				const messages: Anthropic.MessageParam[] = context.messages.map((m) => ({
					role: m.role,
					content: m.content,
				}))

				// Convert our generic tools to Anthropic's format
				const tools: Anthropic.Tool[] | undefined = context.tools?.map((t) => ({
					name: t.name,
					description: t.description,
					input_schema: t.parameters as Anthropic.Tool.InputSchema,
				}))

				// Collect full text and tool calls as they stream
				let fullText = ""
				const toolCalls: ToolCall[] = []
				let inputTokens = 0
				let outputTokens = 0

				const sdkStream = await client.messages.stream({
					model: this.model,
					max_tokens: options.maxTokens ?? 4096,
					system: context.systemPrompt,
					messages,
					tools,
				})

				for await (const event of sdkStream) {
					if (options.signal?.aborted) {
						sdkStream.abort()
						break
					}

					if (event.type === "content_block_delta") {
						if (event.delta.type === "text_delta" && event.delta.text) {
							fullText += event.delta.text
							eventStream.push({ type: "text", content: event.delta.text })
						} else if (event.delta.type === "input_json_delta") {
							// Tool call JSON arrives in pieces — buffer it
							// (handled via content_block_stop below)
						}
					} else if (event.type === "content_block_stop") {
						// If this block was a tool_use, emit the complete tool call
					} else if (event.type === "message_delta") {
						if (event.usage) {
							outputTokens = event.usage.output_tokens
						}
					} else if (event.type === "message_start") {
						if (event.message.usage) {
							inputTokens = event.message.usage.input_tokens
						}
					}
				}

				// Get the final message to extract tool calls cleanly
				const finalMessage = await sdkStream.finalMessage()

				for (const block of finalMessage.content) {
					if (block.type === "tool_use") {
						const tc: ToolCall = {
							id: block.id,
							name: block.name,
							arguments: block.input as Record<string, unknown>,
						}
						toolCalls.push(tc)
						eventStream.push({ type: "toolCall", toolCall: tc })
					}
				}

				const stopReason = finalMessage.stop_reason === "tool_use" ? "toolUse" : "stop"

				const message: AssistantMessage = {
					role: "assistant",
					content: fullText,
					toolCalls,
					usage: {
						inputTokens: finalMessage.usage.input_tokens,
						outputTokens: finalMessage.usage.output_tokens,
					},
					stopReason: stopReason as AssistantMessage["stopReason"],
				}

				eventStream.push({ type: "done", message })
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err))
				eventStream.fail(error)
			}
		})()

		return eventStream
	}
}
