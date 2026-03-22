# Chapter 07 — Agent Loop

## Goal

Combine streaming LLM calls (chapter 05) and tool execution (chapter 06) into a self-running loop. The loop continues until the LLM stops calling tools and gives a final text response.

## The loop

```
while true:
  response = await llm.stream(messages, tools)
  messages.push(response)

  if response.stopReason == "stop":
    break  ← done, final answer received

  if response.stopReason == "toolUse":
    for each toolCall in response.toolCalls:
      result = await executeTool(toolCall)
      messages.push(toolResultMessage(toolCall.id, result))
    continue  ← send tool results back to LLM
```

## Events emitted by the loop

The agent loop is itself an `EventStream`. It emits events for the UI to react to:

```
agent_start
  turn_start
    message_start
    message_update   ← streaming text tokens
    message_update
    message_end
    tool_execution_start
    tool_execution_update  ← progressive tool output (e.g., bash output)
    tool_execution_end
    message_start   ← LLM processes tool result
    message_end
  turn_end
agent_end
```

## Context management

The LLM has a finite context window. As conversations grow, you need to either:
1. Truncate old messages (simple but loses context)
2. Summarize old messages (requires another LLM call)
3. Use a sliding window of recent messages

The real project uses compaction (summarization). For this chapter, we'll use a simple max-messages limit.

## Abort / cancellation

Every async operation in the loop receives an `AbortSignal`. When the user presses Escape, the signal is aborted, the current LLM stream stops, and the loop exits cleanly.

## Files for this chapter

Create the following files in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/agent-loop.ts` | Create — copy from [`src/agent-loop.ts`](./src/agent-loop.ts) |
| `test/agent-loop.test.ts` | Create — copy from [`test/agent-loop.test.ts`](./test/agent-loop.test.ts) |

## The code

`src/agent-loop.ts` contains:
- `agentLoop(messages, context, config)` — returns an EventStream of AgentEvents
- `AgentLoopConfig` — tools, provider, max turns
- `AgentEvent` — all event types

## Debugging tips

- **Infinite loops**: Add `maxTurns` and abort after N iterations. Log each turn.
- **LLM calls nonexistent tool**: The LLM may hallucinate tool names. Return an error result saying "Tool not found: X".
- **Context overflow**: Watch for `stopReason === "length"`. When this happens, compact the context.
- **Tool results too large**: Large tool results (e.g., a 10MB file) will overflow the context. Truncate in the tool's `execute()` function.

## Tests

Run from `pi-from-scratch/`:
```bash
npx vitest --run test/agent-loop.test.ts
```

Tests use a mock provider that returns predefined responses (no real API calls needed).

---

Next: [Chapter 08 — Built-in Tools](../08-builtin-tools/README.md)
