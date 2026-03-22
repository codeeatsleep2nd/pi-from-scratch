# Chapter 05 — LLM Streaming

## Goal

Build an `EventStream` abstraction and a `stream()` function that calls a real LLM API and yields events as tokens arrive. This is the core of the `packages/ai` library.

## Why streaming matters

LLMs generate tokens one at a time. Without streaming, you wait for the entire response before showing anything — which can be 30+ seconds for long outputs. With streaming, you show each token as it arrives, making the UI feel responsive.

## The EventStream abstraction

The real project uses a custom `EventStream<T, R>` that is:
1. An `AsyncIterable<T>` — you can `for await` over events
2. Has a `.result()` promise — resolves when the stream ends with the final value

```typescript
const eventStream = stream(model, context)

// Option 1: iterate events (streaming UI)
for await (const event of eventStream) {
  if (event.type === "text") process.stdout.write(event.content)
}

// Option 2: get final message only (no streaming UI)
const message = await eventStream.result()
```

## Event types

```typescript
type AssistantMessageEvent =
  | { type: "start" }
  | { type: "text"; content: string; index: number }       // streaming token
  | { type: "toolCall"; toolCall: ToolCall; index: number } // complete tool call
  | { type: "done"; message: AssistantMessage }             // final result
  | { type: "error"; error: Error }                         // error occurred
```

## Provider pattern

Each provider is a module with a `stream()` function that:
1. Calls the LLM SDK
2. Transforms SDK-specific events into our generic `AssistantMessageEvent`s
3. Pushes them into the `EventStream`

```typescript
// packages/ai/src/providers/anthropic.ts
export async function stream(model, context, options): Promise<AssistantMessageEventStream> {
  const eventStream = new AssistantMessageEventStream()

  // Non-blocking: start streaming in background
  ;(async () => {
    const sdkStream = client.messages.stream({ ... })
    for await (const event of sdkStream) {
      eventStream.push(mapEvent(event))
    }
  })()

  return eventStream
}
```

## Files for this chapter

Create the following files in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/event-stream.ts` | Create — copy from [`src/event-stream.ts`](./src/event-stream.ts) |
| `src/ai.ts` | Create — copy from [`src/ai.ts`](./src/ai.ts) |
| `src/providers/anthropic.ts` | Create — copy from [`src/providers/anthropic.ts`](./src/providers/anthropic.ts) |
| `src/providers/openai.ts` | Create — copy from [`src/providers/openai.ts`](./src/providers/openai.ts) |
| `test/event-stream.test.ts` | Create — copy from [`test/event-stream.test.ts`](./test/event-stream.test.ts) |

Note: `src/providers/` is a new subdirectory — create it before adding the provider files.

## The code

- `src/event-stream.ts` — Generic `EventStream<T, R>`
- `src/ai.ts` — `stream()` / `complete()` / types
- `src/providers/anthropic.ts` — Anthropic provider
- `src/providers/openai.ts` — OpenAI provider

## How to run the demo

```bash
# Run from pi-from-scratch/ — requires ANTHROPIC_API_KEY or OPENAI_API_KEY with credits loaded
npx tsx src/ai.ts
```

> **Note:** An API key alone is not enough — your account also needs credits loaded. A Claude Pro or ChatGPT subscription does **not** include API credits.
> - Add Anthropic credits: https://console.anthropic.com/settings/billing
> - Add OpenAI credits: https://platform.openai.com/settings/organization/billing
>
> If you have a Claude Pro/Max subscription and don't want to buy API credits, see [Chapter 11 — Auth](../11-auth/README.md) for how to use your subscription token instead.

The demo sends "Say hello in exactly 3 words." to the LLM and streams the response to stdout. Expected output:

```
Streaming response:

Hello there friend

Done!
Tokens: 18 in / 5 out
```

The exact wording varies between runs (LLMs are non-deterministic), but it will be three words and it will appear token by token — you should see each word print as it arrives rather than all at once.

**What to observe:**
- Text appears incrementally as the LLM streams it, not all at once at the end.
- The `Done!` line and token counts only print after the stream ends (from the `type: "done"` event).
- If you remove the `for await` loop and only call `await s.result()`, nothing prints during streaming — you wait for the whole response silently, then get the final message.

## Debugging tips

- **`Warning: Detected unsettled top-level await`**: This happens when `await` is used directly at the top level of an ES module file (outside any `async` function). Move all `await` calls inside an async IIFE: `;(async () => { ... })().catch(console.error)`. The demo in `src/ai.ts` already does this.
- **Stream hangs**: The background async task in the provider may have thrown an error silently. Wrap the entire provider body in a `try/catch` and call `eventStream.fail(error)` in the catch block so consumers don't wait forever.
- **Tokens arrive as null or empty**: Some SDK versions emit events with empty delta text. Guard with `if (delta.text) eventStream.push(...)`.
- **Rate limits / errors**: Always call `eventStream.fail(error)` rather than letting the error escape — otherwise consumers block on `result()` indefinitely.
- **"Your credit balance is too low"**: You have an `ANTHROPIC_API_KEY` but no credits. If you have a Claude Pro/Max subscription, see [Chapter 11 — Auth](../11-auth/README.md) — run `npx tsx src/login.ts` once to get an OAuth token, no API credits needed.

## Tests

Run from `pi-from-scratch/`:
```bash
npx vitest --run test/event-stream.test.ts
```

Tests for `EventStream` run without API keys. Tests for full streaming skip if no API key is set.

---

Next: [Chapter 06 — Tool Calling](../06-tool-calling/README.md)
