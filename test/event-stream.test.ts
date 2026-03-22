/**
 * Step 05 — EventStream tests (no API key needed)
 */
import { describe, it, expect } from "vitest"
import { EventStream } from "../src/event-stream.js"
import { AssistantMessageEventStream, type AssistantMessageEvent, type AssistantMessage } from "../src/ai.js"

// ---------------------------------------------------------------------------
// Generic EventStream tests
// ---------------------------------------------------------------------------

type SimpleEvent = { type: "data"; value: number } | { type: "end"; total: number }

function makeSimpleStream() {
	return new EventStream<SimpleEvent, number>(
		(e) => e.type === "end",
		(e) => (e.type === "end" ? e.total : 0),
	)
}

describe("EventStream", () => {
	it("delivers events to async iterator", async () => {
		const stream = makeSimpleStream()
		const received: SimpleEvent[] = []

		const consumer = (async () => {
			for await (const event of stream) {
				received.push(event)
			}
		})()

		stream.push({ type: "data", value: 1 })
		stream.push({ type: "data", value: 2 })
		stream.push({ type: "end", total: 3 })

		await consumer
		expect(received).toHaveLength(3)
		expect(received[0]).toEqual({ type: "data", value: 1 })
		expect(received[2]).toEqual({ type: "end", total: 3 })
	})

	it(".result() resolves with the terminal event's value", async () => {
		const stream = makeSimpleStream()

		stream.push({ type: "data", value: 10 })
		stream.push({ type: "end", total: 42 })

		const result = await stream.result()
		expect(result).toBe(42)
	})

	it("queues events when no consumer is waiting", async () => {
		const stream = makeSimpleStream()

		// Push before anyone is consuming
		stream.push({ type: "data", value: 1 })
		stream.push({ type: "data", value: 2 })
		stream.push({ type: "end", total: 0 })

		const events: SimpleEvent[] = []
		for await (const event of stream) {
			events.push(event)
		}

		expect(events).toHaveLength(3)
	})

	it(".fail() causes result() to reject", async () => {
		const stream = makeSimpleStream()
		stream.fail(new Error("Test error"))

		await expect(stream.result()).rejects.toThrow("Test error")
	})

	it(".fail() causes iterator to throw", async () => {
		const stream = makeSimpleStream()
		const consumer = (async () => {
			const events: SimpleEvent[] = []
			for await (const event of stream) {
				events.push(event)
			}
			return events
		})()

		stream.fail(new Error("Boom"))

		await expect(consumer).rejects.toThrow("Boom")
	})

	it("throws if you push after done", () => {
		const stream = makeSimpleStream()
		stream.push({ type: "end", total: 0 })
		expect(() => stream.push({ type: "data", value: 1 })).toThrow("Cannot push to a closed stream")
	})
})

// ---------------------------------------------------------------------------
// AssistantMessageEventStream tests
// ---------------------------------------------------------------------------

describe("AssistantMessageEventStream", () => {
	function makeMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
		return {
			role: "assistant",
			content: "Hello",
			toolCalls: [],
			usage: { inputTokens: 10, outputTokens: 5 },
			stopReason: "stop",
			...overrides,
		}
	}

	it("collects text events and resolves done", async () => {
		const stream = new AssistantMessageEventStream()
		const texts: string[] = []

		const consumer = (async () => {
			for await (const event of stream) {
				if (event.type === "text") texts.push(event.content)
			}
		})()

		stream.push({ type: "start" })
		stream.push({ type: "text", content: "Hello" })
		stream.push({ type: "text", content: " World" })
		stream.push({ type: "done", message: makeMessage({ content: "Hello World" }) })

		await consumer
		expect(texts).toEqual(["Hello", " World"])
	})

	it(".result() returns the final AssistantMessage", async () => {
		const stream = new AssistantMessageEventStream()
		const message = makeMessage({ content: "Final answer" })

		stream.push({ type: "done", message })
		const result = await stream.result()
		expect(result.content).toBe("Final answer")
		expect(result.stopReason).toBe("stop")
	})

	it("handles error events", async () => {
		const stream = new AssistantMessageEventStream()
		stream.fail(new Error("API error"))

		await expect(stream.result()).rejects.toThrow("API error")
	})

	it("emits tool calls", async () => {
		const stream = new AssistantMessageEventStream()
		const toolCalls: any[] = []

		const consumer = (async () => {
			for await (const event of stream) {
				if (event.type === "toolCall") toolCalls.push(event.toolCall)
			}
		})()

		stream.push({ type: "start" })
		stream.push({
			type: "toolCall",
			toolCall: { id: "1", name: "read", arguments: { path: "/tmp/test.txt" } },
		})
		stream.push({ type: "done", message: makeMessage({ stopReason: "toolUse" }) })

		await consumer
		expect(toolCalls).toHaveLength(1)
		expect(toolCalls[0]?.name).toBe("read")
	})
})

// ---------------------------------------------------------------------------
// Integration test (skipped if no API key)
// ---------------------------------------------------------------------------

describe("LLM streaming integration", () => {
	it.skipIf(!process.env["ANTHROPIC_API_KEY"] && !process.env["OPENAI_API_KEY"])(
		"streams a real response",
		async () => {
			let provider: any
			if (process.env["ANTHROPIC_API_KEY"]) {
				const { AnthropicProvider } = await import("../src/providers/anthropic.js")
				provider = new AnthropicProvider()
			} else {
				const { OpenAIProvider } = await import("../src/providers/openai.js")
				provider = new OpenAIProvider()
			}

			const { stream } = await import("../src/ai.js")
			const s = await stream(provider, {
				messages: [{ role: "user", content: 'Reply with just the word "pong".' }],
			})

			const texts: string[] = []
			for await (const event of s) {
				if (event.type === "text") texts.push(event.content)
			}

			const message = await s.result()
			expect(message.content.toLowerCase()).toContain("pong")
			expect(message.usage.inputTokens).toBeGreaterThan(0)
			expect(message.usage.outputTokens).toBeGreaterThan(0)
		},
		30_000, // 30 second timeout for API calls
	)
})
