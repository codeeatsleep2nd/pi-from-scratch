# Chapter 06 — Tool Calling

## Goal

Define tools the LLM can call, validate arguments, execute them, and format results for the next LLM turn. Tool calling is the mechanism that lets an AI agent interact with the real world.

## How tool calling works

1. You send the LLM a list of tool definitions (name, description, JSON Schema for params)
2. The LLM may respond with a `toolUse` stop reason and one or more tool calls
3. You execute the tools and collect results
4. You send the results back to the LLM as `toolResult` messages
5. The LLM continues — possibly calling more tools, or giving a final answer

```
User: "What is in /tmp/notes.txt?"

→ LLM: { stopReason: "toolUse", toolCalls: [{ name: "read", args: { path: "/tmp/notes.txt" } }] }
→ You: execute read("/tmp/notes.txt") → "Shopping list:\n- Milk\n- Bread"
→ LLM (with tool result): "The file contains a shopping list with milk and bread."
```

## Tool definition

A tool is defined with:
- `name` — used by the LLM to refer to the tool
- `description` — what the tool does (LLM reads this to decide when to use it)
- `parameters` — JSON Schema object describing the expected arguments
- `execute(args, signal, onUpdate)` — the actual implementation

The `parameters` schema is both sent to the LLM and used to validate arguments before execution.

## Files for this chapter

Create the following files in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/tools.ts` | Create — copy from [`src/tools.ts`](./src/tools.ts) |
| `test/tools.test.ts` | Create — copy from [`test/tools.test.ts`](./test/tools.test.ts) |

## The code

`src/tools.ts` contains:
- `ToolDefinition<T>` — typed tool interface
- `validateArgs(schema, args)` — JSON Schema validation
- `executeTool(tool, args, signal)` — validate + execute wrapper
- `echoTool`, `calculatorTool` — example tools for testing

## Debugging tips

- **LLM calls wrong tool**: Improve the `description`. The LLM uses descriptions to decide which tool to call. Be specific about what the tool does and when to use it.
- **Wrong argument types**: Add a `type` property to every field in the schema. LLMs sometimes send numbers as strings or vice versa.
- **Silent failures**: Always return `{ isError: true, content: "error message" }` instead of throwing — the LLM can see the error and try to recover.
- **Infinite loops**: If a tool always fails, the LLM may try again indefinitely. Add a max-retries limit in the agent loop.

## Tests

Run from `pi-from-scratch/`:
```bash
npx vitest --run test/tools.test.ts
```

---

Next: [Chapter 07 — Agent Loop](../07-agent-loop/README.md)
