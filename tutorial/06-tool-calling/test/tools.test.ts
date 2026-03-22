/**
 * Step 06 — Tool Calling tests
 */
import { describe, it, expect, vi } from "vitest"
import { validateArgs, executeTool, echoTool, calculatorTool, type ToolDefinition } from "../src/tools.js"

describe("validateArgs", () => {
	const schema: ToolDefinition["parameters"] = {
		type: "object",
		properties: {
			path: { type: "string", description: "File path" },
			limit: { type: "number", description: "Max lines" },
			verbose: { type: "boolean" },
		},
		required: ["path"],
	}

	it("passes valid args", () => {
		const { valid } = validateArgs(schema, { path: "/tmp/test.txt" })
		expect(valid).toBe(true)
	})

	it("fails when required field is missing", () => {
		const { valid, errors } = validateArgs(schema, { limit: 10 })
		expect(valid).toBe(false)
		expect(errors.some((e) => e.path === "path")).toBe(true)
	})

	it("fails when type is wrong", () => {
		const { valid, errors } = validateArgs(schema, { path: "/tmp", limit: "not-a-number" })
		expect(valid).toBe(false)
		expect(errors.some((e) => e.path === "limit")).toBe(true)
	})

	it("allows optional fields to be absent", () => {
		const { valid } = validateArgs(schema, { path: "/tmp" })
		expect(valid).toBe(true)
	})

	it("allows unknown properties", () => {
		const { valid } = validateArgs(schema, { path: "/tmp", unknownField: "anything" })
		expect(valid).toBe(true)
	})

	it("fails when args is not an object", () => {
		const { valid } = validateArgs(schema, "not an object")
		expect(valid).toBe(false)
	})

	it("fails when args is an array", () => {
		const { valid } = validateArgs(schema, ["/tmp"])
		expect(valid).toBe(false)
	})

	it("validates enum constraints", () => {
		const enumSchema: ToolDefinition["parameters"] = {
			type: "object",
			properties: {
				mode: { type: "string", enum: ["read", "write", "append"] },
			},
		}
		expect(validateArgs(enumSchema, { mode: "read" }).valid).toBe(true)
		expect(validateArgs(enumSchema, { mode: "delete" }).valid).toBe(false)
	})
})

describe("executeTool", () => {
	it("executes a valid tool call", async () => {
		const result = await executeTool(echoTool, { message: "hello" })
		expect(result.isError).toBe(false)
		expect(result.content).toBe("hello")
	})

	it("returns error when required arg is missing", async () => {
		const result = await executeTool(echoTool, {})
		expect(result.isError).toBe(true)
		expect(result.content).toContain("validation failed")
	})

	it("catches and wraps exceptions from execute()", async () => {
		const throwingTool: ToolDefinition = {
			name: "boom",
			description: "Always throws",
			parameters: { type: "object", properties: {} },
			async execute() {
				throw new Error("Intentional error")
			},
		}
		const result = await executeTool(throwingTool, {})
		expect(result.isError).toBe(true)
		expect(result.content).toContain("Intentional error")
	})

	it("passes AbortSignal to execute()", async () => {
		let receivedSignal: AbortSignal | undefined
		const signalTool: ToolDefinition = {
			name: "signal_test",
			description: "Captures the signal",
			parameters: { type: "object", properties: {} },
			async execute(_args, signal) {
				receivedSignal = signal
				return { content: "ok", isError: false }
			},
		}
		const controller = new AbortController()
		await executeTool(signalTool, {}, controller.signal)
		expect(receivedSignal).toBe(controller.signal)
	})

	it("calls onUpdate with partial results", async () => {
		const updates: string[] = []
		const progressTool: ToolDefinition = {
			name: "progress",
			description: "Reports progress",
			parameters: { type: "object", properties: {} },
			async execute(_args, _signal, onUpdate) {
				onUpdate?.("step 1")
				onUpdate?.("step 2")
				return { content: "done", isError: false }
			},
		}
		await executeTool(progressTool, {}, undefined, (partial) => updates.push(partial))
		expect(updates).toEqual(["step 1", "step 2"])
	})
})

describe("echoTool", () => {
	it("echoes the message", async () => {
		const result = await echoTool.execute({ message: "test" })
		expect(result.content).toBe("test")
		expect(result.isError).toBe(false)
	})
})

describe("calculatorTool", () => {
	it("evaluates basic arithmetic", async () => {
		const r1 = await calculatorTool.execute({ expression: "2 + 2" })
		expect(r1.content).toBe("4")

		const r2 = await calculatorTool.execute({ expression: "10 * 3.14" })
		expect(parseFloat(r2.content)).toBeCloseTo(31.4)
	})

	it("handles division", async () => {
		const result = await calculatorTool.execute({ expression: "10 / 4" })
		expect(result.content).toBe("2.5")
	})

	it("rejects unsafe expressions", async () => {
		const result = await calculatorTool.execute({ expression: "require('fs')" })
		expect(result.isError).toBe(true)
	})

	it("handles parse errors gracefully", async () => {
		const result = await calculatorTool.execute({ expression: "2 +" })
		expect(result.isError).toBe(true)
	})
})
