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

## No demo to run

Like chapter 06, `agent-loop.ts` is infrastructure that sits between the provider (chapter 05) and the UI (chapter 10). Running it directly would require a real provider and a prompt hardcoded in a demo block — not worth it when the tests below exercise the same logic without needing an API key.

## The code

`src/agent-loop.ts` contains:
- `agentLoop(messages, context, config)` — returns an EventStream of AgentEvents
- `AgentLoopConfig` — tools, provider, max turns
- `AgentEvent` — all event types

## What the tests verify

All tests use a **mock provider** instead of a real LLM. The mock takes a list of predefined `AssistantMessage` responses and returns them one at a time. Each call to `stream()` pops the next response from the queue and immediately pushes it into an `AssistantMessageEventStream`. This means the tests run instantly with no API calls.

| Test | What it proves |
|------|---------------|
| emits agent_start and agent_end | the loop wraps every run in bookend events the UI can listen for |
| returns final messages via .result() | you can skip event iteration and just `await loop.result()` to get the full conversation |
| emits message_update for streamed text | text tokens from the provider reach the UI as `message_update` events |
| executes tools and continues the loop | when `stopReason === "toolUse"`, the loop runs the tool, appends the result to messages, and calls the LLM again — the mock queue has two responses to match these two turns |
| handles unknown tool gracefully | if the LLM calls a tool that isn't registered, the loop returns `{ isError: true, content: "not found" }` rather than crashing |
| respects maxTurns | a mock that always responds with a tool call would loop forever — `maxTurns: 3` ensures the loop stops after 3 iterations |
| respects AbortSignal | aborting the controller before the slow mock resolves causes the loop to exit cleanly rather than hang |
| emits turn_start and turn_end | each round trip (LLM call + optional tool execution) is bracketed by turn events |

### The two-response test in detail

The "executes tools" test is the most important — it simulates the full LLM ↔ tool cycle:

```
Mock response 1: stopReason="toolUse", toolCalls=[{name:"echo", args:{message:"test value"}}]
  → loop calls echoTool.execute({message:"test value"}) → "test value"
  → loop appends tool result to messages
Mock response 2: stopReason="stop", content="The echo returned: test value"
  → loop ends
```

The test then asserts that `tool_execution_start` and `tool_execution_end` events were emitted and that the final message list has at least 3 entries: user message, assistant tool-use response, and tool result message.

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
