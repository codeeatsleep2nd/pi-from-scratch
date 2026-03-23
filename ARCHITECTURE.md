# PI from Scratch - Repository Architecture

## Project Overview

`pi-from-scratch` is a step-by-step tutorial for building a Terminal AI Coding Agent. It teaches core concepts through minimal, self-contained examples with tests.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ProcessTerminal                              │
│                    (stdin/stdout control)                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Interactive Mode (TUI)                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Component System (Text, Box, Editor, Markdown)             │   │
│  │  ├─ Differential Renderer (only changed lines)              │   │
│  │  └─ Key Input Parser (escape sequences → typed events)      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent Session                                    │
│  (Conversation state, history, persistence)                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────┬──────────────────────┐
│          Agent Loop (LLM ↔ Tools)            │                      │
│  ┌──────────────────────────────────────┐    │                      │
│  │  Turn 1..N:                          │    │                      │
│  │  1. Build LLM context                │    │                      │
│  │  2. Stream LLM response              │    │                      │
│  │  3. If tool calls → execute tools    │    │                      │
│  │  4. Loop until stop reason           │    │                      │
│  └──────────────────────────────────────┘    │                      │
└──────────────────────────┬───────────────────┴──────────────────────┘
                           │
          ┌────────────────┴───────────────────┐
          ▼                                    ▼
┌─────────────────────────────┐    ┌────────────────────────────┐
│   AI Providers              │    │  Tool Execution            │
│                             │    │                            │
│ ├─ Anthropic Claude         │    │ ├─ read (file)             │
│ │  (streaming via SSE)      │    │ ├─ write (file)            │
│ │                           │    │ ├─ edit (file)             │
│ └─ OpenAI (streaming via    │    │ ├─ bash (execute)          │
│    chat completion)         │    │ └─ Custom tools            │
│                             │    │                            │
└─────────────────────────────┘    └────────────────────────────┘
```

---

## Directory Structure

```
pi-from-scratch/
├── src/                              # Main implementation
│   ├── ai.ts                         # AI provider interface & types
│   ├── agent-loop.ts                 # LLM ↔ tool execution cycle
│   ├── components.ts                 # Composable TUI components
│   ├── event-stream.ts               # Base async event stream
│   ├── interactive.ts                # Interactive mode (TUI orchestration)
│   ├── keys.ts                       # Key input parsing
│   ├── renderer.ts                   # Differential renderer
│   ├── session.ts                    # Session persistence
│   ├── terminal.ts                   # Raw terminal control
│   ├── tools.ts                      # Tool definition & execution
│   │
│   ├── providers/                    # LLM provider implementations
│   │   ├── anthropic.ts              # Claude via Anthropic SDK
│   │   └── openai.ts                 # GPT via OpenAI SDK
│   │
│   └── tools/                        # Built-in tool implementations
│       ├── bash.ts                   # $ bash execution
│       ├── read.ts                   # Read files
│       ├── write.ts                  # Write files
│       └── edit.ts                   # Edit files (text replacement)
│
├── tutorial/                         # Step-by-step learning modules
│   ├── 00-environment-setup/         # TypeScript + vitest setup
│   ├── 01-terminal-basics/           # Raw mode, cursor control, ANSI codes
│   ├── 02-differential-renderer/     # Render only changed screen lines
│   ├── 03-key-input/                 # Parse escape sequences into key events
│   ├── 04-components/                # Composable text components
│   ├── 05-llm-streaming/             # EventStream + provider abstraction
│   ├── 06-tool-calling/              # Define & validate tools
│   ├── 07-agent-loop/                # LLM ↔ tool cycle
│   ├── 08-builtin-tools/             # read/write/bash/edit tools
│   ├── 09-session-persistence/       # Save/load conversations
│   ├── 10-interactive-mode/          # Wire into live TUI
│   ├── 11-auth/                      # API keys vs OAuth tokens
│   └── README.md                     # Tutorial index & overview
│
├── test/                             # Main test files
├── node_modules/                     # Dependencies
├── package.json                      # Project metadata & scripts
├── package-lock.json
├── tsconfig.json                     # TypeScript config
├── vitest.config.ts                  # Test runner config
└── README.md                         # Project README

Each tutorial/ directory has:
  ├── README.md                       # Concepts & walkthrough
  ├── src/                            # Minimal working code
  └── test/                           # Unit tests
```

---

## Data Flow

### User Input → Screen Output

```
stdin (key press)
    │
    ▼
keys.ts (parse escape sequences)
    │
    ▼
interactive.ts (handle event)
    │
    ├─ Update state
    │
    ▼
components.ts (build new layout)
    │
    ▼
renderer.ts (diff old vs new)
    │
    ▼
terminal.ts (write only changed lines to stdout)
    │
    ▼
Screen
```

### Agent Loop

```
User message
    │
    ▼
agent-loop.ts (start turn)
    │
    ▼
ai.ts: provider.stream(context)
    │
    ▼
providers/{anthropic|openai}.ts (LLM API call)
    │
    ├─ Stream tokens → emit "text" events
    │
    ▼
AssistantMessage (final response)
    │
    ├─ Has toolCalls[]?
    │
    ├─ YES: tools.ts → executeTool()
    │   │
    │   ├─ tools/{bash|read|write|edit}.ts (execute)
    │   │
    │   └─ ToolResult
    │
    ├─ Add tool results to messages
    │
    ├─ Loop back to provider.stream()
    │
    └─ NO (stopReason="stop"): Done
```

---

## Key Types & Interfaces

### Core AI Types (`ai.ts`)

```typescript
interface Message {
  role: "user" | "assistant"
  content: string
}

interface Tool {
  name: string
  description: string
  parameters: JSONSchema  // JSON Schema for args validation
}

interface Context {
  systemPrompt?: string
  messages: Message[]
  tools?: Tool[]
}

interface AssistantMessage {
  role: "assistant"
  content: string
  toolCalls: ToolCall[]
  usage: Usage
  stopReason: "stop" | "length" | "toolUse" | "error"
}

interface Provider {
  name: string
  stream(context: Context, options?: StreamOptions): Promise<AssistantMessageEventStream>
}
```

### Tool Types (`tools.ts`)

```typescript
interface ToolDefinition {
  name: string
  description: string
  parameters: JSONSchema
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult>
}

interface ToolResult {
  content: string
  isError: boolean
}
```

### Component Types (`components.ts`)

```typescript
interface Component {
  render(width: number, height: number): string[]
}

// Built-in components: Text, Box, Editor, Markdown
```

### Session Types (`session.ts`)

```typescript
interface Session {
  id: string
  messages: ConversationMessage[]
  created: Date
  modified: Date
  
  save(): Promise<void>
  load(id: string): Promise<Session>
}
```

---

## Learning Path (Tutorial Sequence)

| # | Topic | What You Build |
|---|-------|----------------|
| 00 | Environment Setup | TypeScript project, vitest, dependencies |
| 01 | Terminal Basics | Raw mode, ANSI codes, cursor control |
| 02 | Differential Renderer | Efficient screen update (only changed lines) |
| 03 | Key Input | Parse escape sequences into typed key events |
| 04 | Components | Composable text components that render to strings |
| 05 | LLM Streaming | EventStream + provider abstraction (Anthropic/OpenAI) |
| 06 | Tool Calling | Define tools, validate args with JSON Schema |
| 07 | Agent Loop | The LLM ↔ tool execution cycle |
| 08 | Built-in Tools | read, write, bash, edit file tools |
| 09 | Session Persistence | Save/load conversation history to disk |
| 10 | Interactive Mode | Wire everything into a live TUI |
| 11 | Auth | API keys vs OAuth tokens (Claude Pro/Max) |

**Each step builds on the previous.** Step 10 combines all prior steps into a working agent.

---

## Dependencies

### Main Dependencies
- `@anthropic-ai/sdk` — Claude API
- `@openai/sdk` — GPT API
- `@sinclair/typebox` — JSON Schema generation & validation
- `execa` — Execute shell commands safely

### Dev Dependencies
- `typescript` — Static typing
- `vitest` — Test framework (Vite-based)
- `tsx` — Run TypeScript directly
- `@types/node` — Node.js types

---

## Running the Project

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Watch mode (re-run on change)
npm run test:watch

# Run a tutorial test
cd tutorial/07-agent-loop
npx vitest --run

# Run the interactive agent (requires API key)
npx tsx src/interactive.ts
```

---

## Key Design Patterns

### 1. **EventStream Pattern**
Abstraction for async iteration with built-in result collection.

```typescript
const stream = await provider.stream(context)

for await (const event of stream) {
  // Handle each event
}

const result = await stream.result()  // Or await final result
```

### 2. **Provider Abstraction**
LLM providers are swappable implementations of a common interface.

```typescript
interface Provider {
  stream(context: Context): Promise<AssistantMessageEventStream>
}
```

### 3. **Conversation Message Types**
Typed conversation history with user → assistant → tool_result cycle.

```typescript
type ConversationMessage = UserMessage | AssistantMessage | ToolResultMessage
```

### 4. **Tool Execution Pipeline**
Tools are defined declaratively, validated, then executed.

```
Tool Definition → Validate args with JSON Schema → Execute → Result
```

### 5. **Differential Rendering**
Only update screen lines that changed (improves performance, reduces flicker).

---

## Module Dependency Graph

```
terminal.ts (raw I/O)
    │
    ├─── renderer.ts (diff & render)
    │       ├─── components.ts (layout)
    │       │       └─── (no deps within src)
    │       │
    │       └─── interactive.ts (TUI orchestration)
    │           ├─── keys.ts (input parsing)
    │           └─── agent-loop.ts (LLM ↔ tools)
    │
    ├─── keys.ts (input parsing)
    │
    ├─── ai.ts (LLM interface)
    │   └─── providers/ (Anthropic, OpenAI)
    │
    ├─── agent-loop.ts (LLM ↔ tools)
    │   ├─── ai.ts
    │   ├─── event-stream.ts
    │   └─── tools.ts
    │
    ├─── tools.ts (tool execution)
    │   └─── tools/ (bash, read, write, edit)
    │
    └─── session.ts (persistence)
        └─── (uses agent-loop, tools)
```

---

## Testing Strategy

Each module has unit tests in `test/` or `tutorial/*/test/`:

- **Terminal tests** → Test ANSI escape sequences
- **Renderer tests** → Test differential update logic
- **Component tests** → Test rendering
- **Agent loop tests** → Mock provider, test cycle logic
- **Tool tests** → Test file/bash operations safely
- **Integration tests** → Full agent runs (in tutorial)

Run with:
```bash
npm test                    # All tests
npm run test:watch         # Watch mode
npx vitest --run           # Run once
```

---

## Extension Points

To add features:

1. **New LLM provider?** → Create `src/providers/myprovider.ts` implementing `Provider`
2. **New tool?** → Create `src/tools/mytool.ts`, add to tool registry in `agent-loop.ts`
3. **New component?** → Add to `src/components.ts`, extend `Component` interface
4. **Custom UI?** → Extend `interactive.ts` with new event handlers

---

## Quick Links

- **Tutorial README** → `./tutorial/README.md`
- **Main README** → `./README.md`
- **Package Config** → `./package.json`
- **TypeScript Config** → `./tsconfig.json`
