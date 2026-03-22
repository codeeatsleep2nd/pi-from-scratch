# Chapter 10 — Interactive Mode

## Goal

Wire everything together into a live TUI: user types a message, the agent runs, streaming output appears in the terminal, tools execute with visible progress, and the session is saved automatically.

## Architecture recap

At this point you have all the pieces:

```
ProcessTerminal (stdin/stdout, raw mode)
       |
       v
  TUI + Container         <- Components from chapter 04
  +-----------------+
  | ChatContainer   |     <- growing list of messages
  |   UserMessage   |
  |   AssistantMsg  |     <- streams text as it arrives
  |   ToolResult    |     <- shows tool name + result
  +-----------------+
  +-----------------+
  | InputEditor     |     <- user types here
  +-----------------+
       | Enter
       v
  sendMessage(provider)
       |
       v
  agentLoop() -> events
  +-- message_update       -> append text to assistant message -> re-render
  +-- tool_execution_start -> update status bar -> re-render
  +-- tool_execution_end   -> add tool_result row -> re-render
  +-- loop ends            -> restore input, show token count
```

## Key interactions

| User action | What happens |
|-------------|-------------|
| Type text + Enter | Submit message to agent |
| Escape | Abort the current agent turn |
| Ctrl+C | Exit the application |
| Arrow left/right, Home, End | Move cursor in input line |
| Backspace / Delete | Edit input |

## Rendering strategy

The TUI renders on every event from the agent loop. Since the differential renderer only redraws changed lines, this is efficient even for high-frequency streaming events.

```typescript
for await (const event of loop) {
  updateState(event)  // update state.messages / state.status
  render()            // diff and redraw only changed lines
}
```

## Files for this chapter

Create the following file in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/interactive.ts` | Create — copy from [`src/interactive.ts`](./src/interactive.ts) |

No test file for this chapter — the interactive TUI requires a live terminal and is tested manually using tmux (see below).

## The code

`src/interactive.ts` is a simplified but working interactive mode that:
1. Sets up a TUI with a chat container and input editor
2. Handles key events (Enter to send, Escape to abort)
3. Runs the agent loop and streams output to the TUI
4. Saves the session after each turn

This is intentionally simpler than the real `packages/coding-agent` implementation — it omits markdown rendering, images, theming, and extension support, but demonstrates the complete data flow.

## Running it

```bash
# Run from pi-from-scratch/ — requires an API key
npx tsx src/interactive.ts
```

`main()` reads `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, puts stdin into raw mode, clears the screen, and renders the initial UI:

```
 Pi Coding Agent
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
You: |
Using Anthropic. Type a message and press Enter.
```

The `|` represents the cursor, rendered as a reverse-video space in the real terminal.

### What happens when you type "create a hello-world.ts" and press Enter

**1. Keystroke handling**

Each character you type triggers `handleKey(raw)`. Printable characters are inserted into `state.input` at `state.cursor`. Pressing Enter calls `sendMessage()`.

**2. Message submitted — UI updates immediately**

`sendMessage()` pushes your text onto `state.messages`, clears the input, sets `state.isRunning = true`, and calls `render()` before the first API byte arrives:

```
 Pi Coding Agent
--------------------------------------------------------------------------------

You:
  create a hello-world.ts

Running...
--------------------------------------------------------------------------------
You:
Running... (Escape to abort)
```

While running, all keypresses except Escape and Ctrl+C are ignored.

**3. LLM streams its reply**

`agentLoop()` sends the conversation to the provider and emits `message_update` events for each text token. Each event appends to `assistantMsg.content` and calls `render()`, so you see the response build up character by character:

    Pi Coding Agent
    --------------------------------------------------------------------------------

    You:
      create a hello-world.ts

    Assistant:
      I will create a hello-world.ts file for you.

    Running tool: write...
      v Tool result: Written 1 KB to hello-world.ts

    Assistant:
      I have created hello-world.ts with a simple console.log statement.

    Done - 312 tokens. Enter to send, Ctrl+C to exit.

**4. LLM calls the write tool**

When the LLM decides to call write, agentLoop emits tool_execution_start. The status bar
updates to Running tool: write... and render() is called. Once the tool finishes,
tool_execution_end fires with the result, which is added to state.messages as a tool_result
row (shown as a checkmark line).

The agent then gets one more LLM turn to interpret the tool result and compose a final reply.

**5. Agent finishes**

When stopReason is stop, the loop ends. The final message list from loop.result() replaces
state.messages so everything is consistent. The status bar shows the token count and input
is re-enabled.

## Debugging the TUI

The TUI is hard to unit-test automatically. Use tmux to test it:

```bash
tmux new-session -d -s test -x 120 -y 40
tmux send-keys -t test "npx tsx src/interactive.ts" Enter
sleep 2 && tmux capture-pane -t test -p

# Type a message
tmux send-keys -t test "create a hello-world.ts" Enter

# Wait for response
sleep 10 && tmux capture-pane -t test -p

# Cleanup
tmux kill-session -t test
```

## What to add next

Once this works, the real `pi` adds:
- **Markdown rendering** — `marked` + terminal ANSI rendering
- **Syntax highlighting** — for code blocks in responses
- **Image display** — Kitty/iTerm2 inline image protocol
- **Themes** — configurable color schemes
- **Extensions** — TypeScript plugins that add tools and UI components
- **Session browser** — pick previous sessions at startup
- **Compaction** — auto-summarize old messages when context fills up
- **Multiple provider config** — switch models mid-session

---

Congratulations — you've built a terminal AI coding agent from scratch!
