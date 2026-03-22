/**
 * Step 06 — Tool Calling
 *
 * Tool definitions, argument validation, and execution.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolResult {
	content: string
	isError: boolean
}

export interface ToolDefinition<TArgs = Record<string, unknown>> {
	name: string
	description: string
	/** JSON Schema for parameters (sent to LLM and used for validation) */
	parameters: {
		type: "object"
		properties: Record<string, JsonSchemaProperty>
		required?: string[]
	}
	/** Execute the tool with validated arguments */
	execute(args: TArgs, signal?: AbortSignal, onUpdate?: (partial: string) => void): Promise<ToolResult>
}

interface JsonSchemaProperty {
	type: "string" | "number" | "boolean" | "array" | "object"
	description?: string
	items?: JsonSchemaProperty
	properties?: Record<string, JsonSchemaProperty>
	required?: string[]
	enum?: unknown[]
}

// ---------------------------------------------------------------------------
// Argument validation (minimal JSON Schema subset)
// ---------------------------------------------------------------------------

export interface ValidationError {
	path: string
	message: string
}

export function validateArgs(
	schema: ToolDefinition["parameters"],
	args: unknown,
): { valid: boolean; errors: ValidationError[] } {
	const errors: ValidationError[] = []

	if (typeof args !== "object" || args === null || Array.isArray(args)) {
		return { valid: false, errors: [{ path: "", message: "Arguments must be an object" }] }
	}

	const obj = args as Record<string, unknown>

	// Check required fields
	for (const field of schema.required ?? []) {
		if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
			errors.push({ path: field, message: `Required field '${field}' is missing` })
		}
	}

	// Check types of provided fields
	for (const [key, value] of Object.entries(obj)) {
		const propSchema = schema.properties[key]
		if (!propSchema) continue // Unknown properties are allowed

		const typeError = checkType(key, value, propSchema)
		if (typeError) errors.push(typeError)
	}

	return { valid: errors.length === 0, errors }
}

function checkType(path: string, value: unknown, schema: JsonSchemaProperty): ValidationError | null {
	if (value === null || value === undefined) return null

	const actualType = Array.isArray(value) ? "array" : typeof value
	if (actualType !== schema.type) {
		return { path, message: `Expected ${schema.type}, got ${actualType}` }
	}

	if (schema.enum && !schema.enum.includes(value)) {
		return { path, message: `Value must be one of: ${schema.enum.join(", ")}` }
	}

	return null
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

/**
 * Validate arguments against the tool schema, then execute the tool.
 * Returns a ToolResult — never throws.
 */
export async function executeTool(
	tool: ToolDefinition,
	rawArgs: unknown,
	signal?: AbortSignal,
	onUpdate?: (partial: string) => void,
): Promise<ToolResult> {
	// Validate
	const { valid, errors } = validateArgs(tool.parameters, rawArgs)
	if (!valid) {
		const message = errors.map((e) => `${e.path}: ${e.message}`).join("; ")
		return { content: `Argument validation failed: ${message}`, isError: true }
	}

	// Execute
	try {
		return await tool.execute(rawArgs as Record<string, unknown>, signal, onUpdate)
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		return { content: `Tool execution failed: ${message}`, isError: true }
	}
}

// ---------------------------------------------------------------------------
// Example tools (real implementations are in step 08)
// ---------------------------------------------------------------------------

/** Echo tool — useful for testing */
export const echoTool: ToolDefinition<{ message: string }> = {
	name: "echo",
	description: "Echo back the provided message. Useful for testing.",
	parameters: {
		type: "object",
		properties: {
			message: { type: "string", description: "The message to echo" },
		},
		required: ["message"],
	},
	async execute({ message }) {
		return { content: message, isError: false }
	},
}

/** Calculator tool */
export const calculatorTool: ToolDefinition<{ expression: string }> = {
	name: "calculate",
	description: "Evaluate a simple mathematical expression like '2 + 2' or '10 * 3.14'.",
	parameters: {
		type: "object",
		properties: {
			expression: { type: "string", description: "Mathematical expression to evaluate" },
		},
		required: ["expression"],
	},
	async execute({ expression }) {
		// Only allow safe characters
		if (!/^[\d\s+\-*/().]+$/.test(expression)) {
			return { content: "Invalid expression: only numbers and basic operators allowed", isError: true }
		}
		try {
			// Using Function is intentional here for eval — in prod, use a proper math parser
			const result = Function(`"use strict"; return (${expression})`)()
			return { content: String(result), isError: false }
		} catch (err) {
			return { content: `Evaluation error: ${err instanceof Error ? err.message : String(err)}`, isError: true }
		}
	},
}

/** Format a ToolResult for inclusion in the next LLM message */
export function formatToolResultForLLM(toolCallId: string, result: ToolResult): string {
	if (result.isError) {
		return `Tool call ${toolCallId} failed with error:\n${result.content}`
	}
	return result.content
}
