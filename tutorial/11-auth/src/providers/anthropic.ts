/**
 * Chapter 11 — Anthropic Provider (updated)
 *
 * Same as Chapter 05, but the constructor now accepts an optional pre-built
 * Anthropic client. When provided, it skips creating its own client (and
 * therefore doesn't need ANTHROPIC_API_KEY to be set). This lets the auth
 * module inject OAuth clients transparently.
 */

import Anthropic from "@anthropic-ai/sdk"
import type { Provider, Context, StreamOptions, ToolCall, AssistantMessage } from "../ai.js"
import { AssistantMessageEventStream } from "../ai.js"

export class AnthropicProvider implements Provider {
	name = "anthropic"
	private model: string
	private client: Anthropic

	/**
	 * @param model   Model ID (default: claude-haiku-4-5-20251001)
	 * @param client  Optional pre-built Anthropic client. When omitted the
	 *                provider reads ANTHROPIC_API_KEY from the environment.
	 */
	constructor(model = "claude-haiku-4-5-20251001", client?: Anthropic) {
		this.model = model
		this.client = client ?? new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })
	}

	async stream(context: Context, options: StreamOptions = {}): Promise<AssistantMessageEventStream> {
		const eventStream = new AssistantMessageEventStream()

		;(async () => {
			try {
				eventStream.push({ type: "start" })

				const messages: Anthropic.MessageParam[] = context.messages.map((m) => ({
					role: m.role,
					content: m.content,
				}))

				const tools: Anthropic.Tool[] | undefined = context.tools?.map((t) => ({
					name: t.name,
					description: t.description,
					input_schema: t.parameters as Anthropic.Tool.InputSchema,
				}))

				let fullText = ""
				const toolCalls: ToolCall[] = []
				let inputTokens = 0
				let outputTokens = 0

				const sdkStream = await this.client.messages.stream({
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
						}
					} else if (event.type === "message_delta") {
						if (event.usage) outputTokens = event.usage.output_tokens
					} else if (event.type === "message_start") {
						if (event.message.usage) inputTokens = event.message.usage.input_tokens
					}
				}

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

				const message: AssistantMessage = {
					role: "assistant",
					content: fullText,
					toolCalls,
					usage: {
						inputTokens: finalMessage.usage.input_tokens,
						outputTokens: finalMessage.usage.output_tokens,
					},
					stopReason: finalMessage.stop_reason === "tool_use" ? "toolUse" : "stop",
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
