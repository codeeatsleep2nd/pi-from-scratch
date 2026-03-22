/**
 * Step 05 — OpenAI Provider
 *
 * Wraps the openai SDK to implement the Provider interface.
 */

import OpenAI from "openai"
import type { Provider, Context, StreamOptions, ToolCall, AssistantMessage } from "../ai.js"
import { AssistantMessageEventStream } from "../ai.js"

export class OpenAIProvider implements Provider {
	name = "openai"
	private model: string

	constructor(model = "gpt-4o-mini") {
		this.model = model
	}

	async stream(context: Context, options: StreamOptions = {}): Promise<AssistantMessageEventStream> {
		const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] })
		const eventStream = new AssistantMessageEventStream()

		;(async () => {
			try {
				eventStream.push({ type: "start" })

				// Convert tools
				const tools: OpenAI.Chat.ChatCompletionTool[] | undefined = context.tools?.map((t) => ({
					type: "function" as const,
					function: {
						name: t.name,
						description: t.description,
						parameters: t.parameters,
					},
				}))

				// Build messages
				const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
				if (context.systemPrompt) {
					messages.push({ role: "system", content: context.systemPrompt })
				}
				for (const m of context.messages) {
					messages.push({ role: m.role, content: m.content })
				}

				let fullText = ""
				const toolCallAccumulators: Map<number, { id: string; name: string; args: string }> = new Map()
				let inputTokens = 0
				let outputTokens = 0

				const sdkStream = await client.chat.completions.create({
					model: this.model,
					max_tokens: options.maxTokens ?? 4096,
					messages,
					tools,
					stream: true,
					stream_options: { include_usage: true },
				})

				for await (const chunk of sdkStream) {
					if (options.signal?.aborted) break

					const delta = chunk.choices[0]?.delta
					if (!delta) continue

					if (delta.content) {
						fullText += delta.content
						eventStream.push({ type: "text", content: delta.content })
					}

					// Accumulate streaming tool calls
					if (delta.tool_calls) {
						for (const tc of delta.tool_calls) {
							const idx = tc.index
							if (!toolCallAccumulators.has(idx)) {
								toolCallAccumulators.set(idx, { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" })
							}
							const acc = toolCallAccumulators.get(idx)!
							if (tc.function?.arguments) acc.args += tc.function.arguments
							if (tc.id) acc.id = tc.id
							if (tc.function?.name) acc.name = tc.function.name
						}
					}

					if (chunk.usage) {
						inputTokens = chunk.usage.prompt_tokens
						outputTokens = chunk.usage.completion_tokens
					}
				}

				// Emit complete tool calls
				const toolCalls: ToolCall[] = []
				for (const [, acc] of toolCallAccumulators) {
					let args: Record<string, unknown> = {}
					try {
						args = JSON.parse(acc.args)
					} catch {}
					const tc: ToolCall = { id: acc.id, name: acc.name, arguments: args }
					toolCalls.push(tc)
					eventStream.push({ type: "toolCall", toolCall: tc })
				}

				const stopReason = toolCalls.length > 0 ? "toolUse" : "stop"

				const message: AssistantMessage = {
					role: "assistant",
					content: fullText,
					toolCalls,
					usage: { inputTokens, outputTokens },
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
