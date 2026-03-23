# pi-from-scratch

A step-by-step tutorial for building a terminal AI coding agent from scratch in TypeScript — inspired by [pi-mono](https://github.com/pi-mono/pi-mono).

Each chapter introduces one concept with minimal working code and tests you can run. By the end, you have a fully functional, interactive, streaming AI coding agent running in your terminal.

## What you build

A terminal AI coding agent with:
- **TUI** — differential renderer that only redraws changed lines, key input parsing
- **Streaming LLM** — real-time token streaming via Anthropic Claude or OpenAI
- **Tool calling** — read/write/edit files, run bash commands
- **Agent loop** — the LLM ↔ tool execution cycle (multi-turn)
- **Session persistence** — save and resume conversations
- **Auth** — API key or OAuth token (use Claude Pro/Max without API credits)

## Chapters

| # | Topic | What you build |
|---|-------|----------------|
| [00](tutorial/00-environment-setup/README.md) | Environment Setup | TypeScript project, vitest, dependencies |
| [01](tutorial/01-terminal-basics/README.md) | Terminal Basics | Raw mode, ANSI codes, cursor control |
| [02](tutorial/02-differential-renderer/README.md) | Differential Renderer | Render only changed screen lines |
| [03](tutorial/03-key-input/README.md) | Key Input | Parse escape sequences into typed key events |
| [04](tutorial/04-components/README.md) | Components | Composable text components |
| [05](tutorial/05-llm-streaming/README.md) | LLM Streaming | EventStream abstraction + streaming provider calls |
| [06](tutorial/06-tool-calling/README.md) | Tool Calling | Define tools, validate args with JSON Schema |
| [07](tutorial/07-agent-loop/README.md) | Agent Loop | LLM ↔ tool execution cycle |
| [08](tutorial/08-builtin-tools/README.md) | Built-in Tools | read, write, bash, edit file tools |
| [09](tutorial/09-session-persistence/README.md) | Session Persistence | Save/load conversation history |
| [10](tutorial/10-interactive-mode/README.md) | Interactive Mode | Wire everything into a live TUI |
| [11](tutorial/11-auth/README.md) | Auth | API keys vs OAuth tokens |

## Prerequisites

- Node.js >= 20
- An Anthropic or OpenAI API key (or a Claude Pro/Max subscription — see Chapter 11)
- Basic TypeScript knowledge

## Getting started

```bash
npm install

# Run all tests
npm test

# Run a single chapter's tests
cd tutorial/07-agent-loop && npx vitest --run

# Launch the interactive agent (requires API key)
ANTHROPIC_API_KEY=sk-... npx tsx src/interactive.ts
```

## Project structure

```
pi-from-scratch/
├── src/                  # Final implementation (all chapters combined)
│   ├── interactive.ts    # TUI orchestration — entry point
│   ├── agent-loop.ts     # LLM ↔ tool cycle
│   ├── renderer.ts       # Differential renderer
│   ├── components.ts     # Text, Box, Editor components
│   ├── keys.ts           # Key input parsing
│   ├── terminal.ts       # Raw terminal control
│   ├── session.ts        # Session persistence
│   ├── ai.ts             # Provider interface & types
│   ├── tools.ts          # Tool execution
│   ├── event-stream.ts   # Async event stream base
│   ├── providers/        # anthropic.ts, openai.ts
│   └── tools/            # bash.ts, read.ts, write.ts, edit.ts
├── tutorial/             # Step-by-step chapters (self-contained)
└── test/                 # Tests for src/
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed architecture diagram and data flow.
