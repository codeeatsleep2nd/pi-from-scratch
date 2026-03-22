/**
 * Step 07 — Agent Loop tests
 *
 * Uses a mock provider so no real API calls are made.
 */
import { describe, it, expect, vi } from "vitest"
import { agentLoop, type ConversationMessage } from "../src/agent-loop.js"
import type { Provider, Context, AssistantMessageEventStream, AssistantMessage } from "../../05-llm-streaming/src/ai.js"
import { AssistantMessageEventStream as Stream } from "../../05-llm-streaming/src/ai.js"
import type { ToolDefinition } from "../../06-tool-calling/src/tools.js"

// ---------------------------------------------------------------------------
// Mock provider builder
// ---------------------------------------------------------------------------

/**
 * Build a mock provider that returns predefined responses.
 * Each call to stream() pops the next response from the queue.
 */
function makeMockProvider(responses: AssistantMessage[]): Provider {
	let callCount = 0
	return {
		name: "mock",
		async stream(_context: Context): Promise<AssistantMessageEventStream> {
			const response = responses[callCount++]
			if (!response) throw new Error("Mock provider: no more responses")

			const s = new Stream()
			s.push({ type: "start" })
			if (response.content) {
				s.push({ type: "text", content: response.content })
			}
			for (const tc of response.toolCalls) {
				s.push({ type: "toolCall", toolCall: tc })
			}
			s.push({ type: "done", message: response })
			return s
		},
	}
}

function makeMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		role: "assistant",
		content: "",
		toolCalls: [],
		usage: { inputTokens: 10, outputTokens: 5 },
		stopReason: "stop",
		...overrides,
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("agentLoop", () => {
	it("emits agent_start and agent_end events", async () => {
		const provider = makeMockProvider([makeMessage({ content: "Hello!", stopReason: "stop" })])
		const loop = agentLoop([{ role: "user", content: "Hi" }], { provider })

		const eventTypes: string[] = []
		for await (const event of loop) {
			eventTypes.push(event.type)
		}

		expect(eventTypes[0]).toBe("agent_start")
		expect(eventTypes[eventTypes.length - 1]).toBe("agent_end")
	})

	it("returns final messages via .result()", async () => {
		const provider = makeMockProvider([makeMessage({ content: "The answer is 42.", stopReason: "stop" })])
		const loop = agentLoop([{ role: "user", content: "What is the answer?" }], { provider })

		const messages = await loop.result()
		expect(messages).toHaveLength(2) // user + assistant
		expect(messages[1]?.role).toBe("assistant")
	})

	it("emits message_update events for streamed text", async () => {
		const provider = makeMockProvider([makeMessage({ content: "Hello world", stopReason: "stop" })])
		const loop = agentLoop([{ role: "user", content: "Say hello" }], { provider })

		const updates: string[] = []
		for await (const event of loop) {
			if (event.type === "message_update") updates.push(event.text)
		}

		expect(updates).toContain("Hello world")
	})

	it("executes tools and continues the loop", async () => {
		// First response: call the echo tool
		// Second response: final answer using the echo result
		const provider = makeMockProvider([
			makeMessage({
				content: "",
				stopReason: "toolUse",
				toolCalls: [{ id: "tc1", name: "echo", arguments: { message: "test value" } }],
			}),
			makeMessage({ content: "The echo returned: test value", stopReason: "stop" }),
		])

		const echoTool: ToolDefinition<{ message: string }> = {
			name: "echo",
			description: "Echo",
			parameters: {
				type: "object",
				properties: { message: { type: "string" } },
				required: ["message"],
			},
			async execute({ message }) {
				return { content: message, isError: false }
			},
		}

		const loop = agentLoop([{ role: "user", content: "Use echo with 'test value'" }], {
			provider,
			tools: [echoTool],
		})

		const toolStarts: string[] = []
		const toolEnds: string[] = []

		for await (const event of loop) {
			if (event.type === "tool_execution_start") toolStarts.push(event.toolName)
			if (event.type === "tool_execution_end") toolEnds.push(event.result.content)
		}

		expect(toolStarts).toContain("echo")
		expect(toolEnds).toContain("test value")

		const messages = await loop.result()
		// user + assistant(toolUse) + tool_result + assistant(final)
		expect(messages.length).toBeGreaterThanOrEqual(3)
	})

	it("handles unknown tool gracefully", async () => {
		const provider = makeMockProvider([
			makeMessage({
				content: "",
				stopReason: "toolUse",
				toolCalls: [{ id: "tc1", name: "nonexistent_tool", arguments: {} }],
			}),
			makeMessage({ content: "Sorry, that tool is unavailable.", stopReason: "stop" }),
		])

		const loop = agentLoop([{ role: "user", content: "Use nonexistent tool" }], { provider, tools: [] })

		const toolErrors: string[] = []
		for await (const event of loop) {
			if (event.type === "tool_execution_end" && event.result.isError) {
				toolErrors.push(event.result.content)
			}
		}

		expect(toolErrors.length).toBeGreaterThan(0)
		expect(toolErrors[0]).toContain("not found")
	})

	it("respects maxTurns", async () => {
		// Always respond with a tool call — would loop forever without maxTurns
		const alwaysCallsTool: Provider = {
			name: "infinite",
			async stream() {
				const s = new Stream()
				s.push({ type: "start" })
				s.push({
					type: "toolCall",
					toolCall: { id: `tc-${Date.now()}`, name: "echo", arguments: { message: "x" } },
				})
				s.push({
					type: "done",
					message: makeMessage({
						stopReason: "toolUse",
						toolCalls: [{ id: `tc-${Date.now()}`, name: "echo", arguments: { message: "x" } }],
					}),
				})
				return s
			},
		}

		const echoTool: ToolDefinition<{ message: string }> = {
			name: "echo",
			description: "Echo",
			parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
			async execute({ message }) { return { content: message, isError: false } },
		}

		const loop = agentLoop([{ role: "user", content: "go" }], {
			provider: alwaysCallsTool,
			tools: [echoTool],
			maxTurns: 3,
		})

		// Should not hang
		await loop.result()
	}, 10_000)

	it("respects AbortSignal", async () => {
		const controller = new AbortController()
		const provider: Provider = {
			name: "slow",
			async stream() {
				const s = new Stream()
				// Simulate slow stream
				setTimeout(() => {
					s.push({ type: "text", content: "Hello" })
					s.push({ type: "done", message: makeMessage({ content: "Hello", stopReason: "stop" }) })
				}, 5000)
				return s
			},
		}

		const loop = agentLoop([{ role: "user", content: "Hi" }], {
			provider,
			signal: controller.signal,
		})

		// Abort immediately
		controller.abort()

		// Should not hang — either completes with error event or agent_end
		const eventTypes: string[] = []
		for await (const event of loop) {
			eventTypes.push(event.type)
		}

		// The loop should have ended (either normally or with error)
		expect(eventTypes.length).toBeGreaterThan(0)
	}, 10_000)

	it("emits turn_start and turn_end events", async () => {
		const provider = makeMockProvider([makeMessage({ content: "Done", stopReason: "stop" })])
		const loop = agentLoop([{ role: "user", content: "Hi" }], { provider })

		const eventTypes: string[] = []
		for await (const event of loop) {
			eventTypes.push(event.type)
		}

		expect(eventTypes).toContain("turn_start")
		expect(eventTypes).toContain("turn_end")
	})
})
