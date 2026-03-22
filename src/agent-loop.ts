/**
 * Step 07 — Agent Loop
 *
 * Runs the LLM ↔ tool execution cycle as an EventStream.
 */

import { EventStream } from "./event-stream.js"
import type { Provider, Context, AssistantMessage, Message, ToolCall } from "./ai.js"
import type { ToolDefinition, ToolResult } from "./tools.js"
import { executeTool } from "./tools.js"

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type AgentEvent =
	| { type: "agent_start" }
	| { type: "agent_end"; messages: ConversationMessage[] }
	| { type: "turn_start"; turnNumber: number }
	| { type: "turn_end"; message: AssistantMessage }
	| { type: "message_update"; text: string } // streaming token
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: Record<string, unknown> }
	| { type: "tool_execution_update"; toolCallId: string; partial: string }
	| { type: "tool_execution_end"; toolCallId: string; result: ToolResult }
	| { type: "error"; error: Error }

type TerminalEvent = { type: "agent_end"; messages: ConversationMessage[] } | { type: "error"; error: Error }

function isTerminal(e: AgentEvent): e is TerminalEvent {
	return e.type === "agent_end" || e.type === "error"
}

function getResult(e: AgentEvent): ConversationMessage[] {
	if (e.type === "agent_end") return e.messages
	if (e.type === "error") throw e.error
	return []
}

export class AgentEventStream extends EventStream<AgentEvent, ConversationMessage[]> {
	constructor() {
		super(isTerminal, getResult)
	}
}

// ---------------------------------------------------------------------------
// Conversation message types
// ---------------------------------------------------------------------------

export interface UserMessage {
	role: "user"
	content: string
}

export interface ToolResultMessage {
	role: "tool_result"
	toolCallId: string
	content: string
	isError: boolean
}

export type ConversationMessage = UserMessage | AssistantMessage | ToolResultMessage

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AgentLoopConfig {
	provider: Provider
	tools?: ToolDefinition[]
	maxTurns?: number
	systemPrompt?: string
	signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

/**
 * Run the agent loop.
 *
 * Returns an EventStream you can iterate to watch progress,
 * or await .result() to get all messages when done.
 */
export function agentLoop(initialMessages: ConversationMessage[], config: AgentLoopConfig): AgentEventStream {
	const eventStream = new AgentEventStream()

	;(async () => {
		const { provider, tools = [], maxTurns = 20, systemPrompt, signal } = config
		const messages: ConversationMessage[] = [...initialMessages]
		let turn = 0

		eventStream.push({ type: "agent_start" })

		try {
			while (turn < maxTurns) {
				if (signal?.aborted) {
					throw new Error("Aborted by user")
				}

				turn++
				eventStream.push({ type: "turn_start", turnNumber: turn })

				// ----------------------------------------------------------------
				// Build context for the LLM
				// ----------------------------------------------------------------
				const llmMessages = buildLlmMessages(messages)
				const context: Context = {
					systemPrompt,
					messages: llmMessages,
					tools: tools.map((t) => ({
						name: t.name,
						description: t.description,
						parameters: t.parameters,
					})),
				}

				// ----------------------------------------------------------------
				// Stream the LLM response
				// ----------------------------------------------------------------
				const s = await provider.stream(context, { signal })

				let accumulatedText = ""
				for await (const event of s) {
					if (signal?.aborted) break
					if (event.type === "text") {
						accumulatedText += event.content
						eventStream.push({ type: "message_update", text: event.content })
					}
				}

				const assistantMessage = await s.result()
				messages.push(assistantMessage)
				eventStream.push({ type: "turn_end", message: assistantMessage })

				// ----------------------------------------------------------------
				// If the LLM stopped normally (no tools), we're done
				// ----------------------------------------------------------------
				if (assistantMessage.stopReason === "stop" || assistantMessage.stopReason === "length") {
					break
				}

				// ----------------------------------------------------------------
				// Execute tool calls
				// ----------------------------------------------------------------
				if (assistantMessage.stopReason === "toolUse" && assistantMessage.toolCalls.length > 0) {
					const toolMap = new Map(tools.map((t) => [t.name, t]))

					for (const toolCall of assistantMessage.toolCalls) {
						if (signal?.aborted) break

						eventStream.push({
							type: "tool_execution_start",
							toolCallId: toolCall.id,
							toolName: toolCall.name,
							args: toolCall.arguments,
						})

						const tool = toolMap.get(toolCall.name)
						let result: ToolResult

						if (!tool) {
							result = {
								content: `Tool not found: "${toolCall.name}". Available tools: ${tools.map((t) => t.name).join(", ")}`,
								isError: true,
							}
						} else {
							result = await executeTool(
								tool,
								toolCall.arguments,
								signal,
								(partial) => {
									eventStream.push({ type: "tool_execution_update", toolCallId: toolCall.id, partial })
								},
							)
						}

						eventStream.push({ type: "tool_execution_end", toolCallId: toolCall.id, result })

						messages.push({
							role: "tool_result",
							toolCallId: toolCall.id,
							content: result.content,
							isError: result.isError,
						})
					}

					// Loop again to let LLM process tool results
					continue
				}

				// Unexpected stop reason — bail out
				break
			}

			if (turn >= maxTurns) {
				console.warn(`Agent loop reached maxTurns (${maxTurns}), stopping.`)
			}

			eventStream.push({ type: "agent_end", messages })
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err))
			eventStream.fail(error)
		}
	})()

	return eventStream
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

/**
 * Convert ConversationMessage[] to the generic Message[] format the provider expects.
 * Tool results are formatted as user messages containing the result text.
 */
function buildLlmMessages(messages: ConversationMessage[]): Message[] {
	const result: Message[] = []

	for (const msg of messages) {
		if (msg.role === "user") {
			result.push({ role: "user", content: msg.content })
		} else if (msg.role === "assistant") {
			result.push({ role: "assistant", content: msg.content || "(tool call)" })
		} else if (msg.role === "tool_result") {
			// Embed tool results as user messages
			// In a real implementation, use the provider-specific tool result format
			result.push({
				role: "user",
				content: msg.isError
					? `Tool result (ERROR for ${msg.toolCallId}):\n${msg.content}`
					: `Tool result (for ${msg.toolCallId}):\n${msg.content}`,
			})
		}
	}

	return result
}
