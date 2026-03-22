# Building a Terminal AI Coding Agent from Scratch

This tutorial walks you through building the `pi` coding agent step by step — from raw terminal I/O to a fully interactive, streaming, tool-calling AI agent. Each step introduces one concept, has minimal working code, and includes tests you can run.

## Prerequisites

- Node.js >= 20
- An API key from Anthropic, OpenAI, or another provider
- Basic TypeScript knowledge

## Steps

| Step | Topic | What you build |
|------|-------|---------------|
| [00](./00-environment-setup/README.md) | Environment Setup | TypeScript project, vitest, dependencies |
| [01](./01-terminal-basics/README.md) | Terminal Basics | Raw mode, ANSI output, cursor control |
| [02](./02-differential-renderer/README.md) | Differential Renderer | Render only changed lines — the core TUI trick |
| [03](./03-key-input/README.md) | Key Input Parsing | Parse escape sequences into typed key events |
| [04](./04-components/README.md) | Component System | Composable text components that render to string arrays |
| [05](./05-llm-streaming/README.md) | LLM Streaming | EventStream abstraction + streaming LLM calls |
| [06](./06-tool-calling/README.md) | Tool Calling | Define tools, validate args, execute them |
| [07](./07-agent-loop/README.md) | Agent Loop | The LLM ↔ tool execution cycle |
| [08](./08-builtin-tools/README.md) | Built-in Tools | Read, write, bash, edit file tools |
| [09](./09-session-persistence/README.md) | Session Persistence | Save/load conversations to disk |
| [10](./10-interactive-mode/README.md) | Interactive Mode | Wire everything into a live TUI |

## How to read this tutorial

Each step directory contains:
- **README.md** — Concepts, walkthrough, and debugging tips
- **src/** — Minimal working code for that step
- **test/** — Tests you can run with `npx vitest --run`

The code in each step is self-contained and intentionally simplified. The real implementation in `packages/` has more edge cases, provider support, and polish — but the structure maps directly.

## Architecture overview

```
ProcessTerminal (stdin/stdout)
       │
       ▼
   TUI / Container  ←── Components (Text, Box, Editor, Markdown)
       │
       ▼
  InteractiveMode
       │
       ▼
   AgentSession
       │
       ▼
  Agent Loop  ←──────────────────────────────────┐
       │                                          │
       ▼                                          │
  AI Provider (stream)          Tool execution ──┘
  (Anthropic, OpenAI, ...)      (read/write/bash/edit)
```

Start at step 00 and work forward. Each step is a foundation for the next.
