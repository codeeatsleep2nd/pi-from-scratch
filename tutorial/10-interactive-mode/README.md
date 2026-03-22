# Chapter 10 — Interactive Mode

## Goal

Wire everything together into a live TUI: user types a message, the agent runs, streaming output appears in the terminal, tools execute with visible progress, and the session is saved automatically.

## Architecture recap

At this point you have all the pieces:

```
ProcessTerminal (stdin/stdout, raw mode)
       │
       ▼
  TUI + Container         ← Components from chapter 04
  ┌──────────────────┐
  │ ChatContainer    │    ← growing list of messages
  │   UserMessage    │
  │   AssistantMsg   │    ← streams text as it arrives
  │   ToolExecution  │    ← shows tool name + result
  │   ...            │
  └──────────────────┘
  ┌──────────────────┐
  │ InputEditor      │    ← user types here
  └──────────────────┘
       │ Ctrl+Enter
       ▼
  AgentSession.run(message)
       │
       ▼
  agentLoop() → events
  ├── message_update → append text to AssistantMessage component → re-render
  ├── tool_execution_start → add ToolExecution component → re-render
  ├── tool_execution_end   → update ToolExecution component → re-render
  └── agent_end → save session, re-enable input
```

## Key interactions

| User action | What happens |
|-------------|-------------|
| Type text + Ctrl+Enter | Submit message to agent |
| Escape | Abort the current agent turn |
| Ctrl+C | Exit the application |
| ↑/↓ in empty input | Navigate message history |

## Rendering strategy

The TUI renders on every event from the agent loop. Since the differential renderer only redraws changed lines, this is efficient even for high-frequency streaming events.

```typescript
session.on((event) => {
  updateComponents(event)  // update the relevant component
  tui.render()             // diff and redraw
})
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

## Debugging the TUI

The TUI is hard to unit-test automatically. Use tmux to test it:

```bash
tmux new-session -d -s test -x 120 -y 40
tmux send-keys -t test "npx tsx src/interactive.ts" Enter
sleep 2 && tmux capture-pane -t test -p

# Type a message
tmux send-keys -t test "What is 2+2?" Enter

# Wait for response
sleep 5 && tmux capture-pane -t test -p

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
