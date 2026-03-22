# Chapter 04 — Component System

## Goal

Build a composable component model where each component renders itself as an array of strings (lines). Components can be nested inside containers. The TUI calls `render(width)` on the root container on each frame.

## Design

The key insight is simple: **every component is just a function that takes a width and returns lines**.

```typescript
interface Component {
  render(width: number): string[]
}
```

This is far simpler than DOM-style trees. No virtual DOM, no diffing at the component level — components produce lines, and the renderer diffs lines.

## Built-in components

| Component | Description |
|-----------|-------------|
| `Text` | Wraps a string, handles word-wrap |
| `Box` | Draws a border around children |
| `VStack` | Stacks children vertically |
| `HStack` | Places children side by side |
| `Spacer` | Empty lines for padding |

## Cursor positioning

Some components (like a text editor) need to tell the terminal where to place the cursor. The real project embeds a special zero-width marker `CURSOR_MARKER` (`\x1b_pi:c\x07`) in the rendered output. The TUI scans for this marker, extracts the position, and sends a cursor-move sequence.

```
Line 0: "Enter text:"
Line 1: "Hello|world"   ← CURSOR_MARKER embedded here marks cursor position
Line 2: ""
```

We implement a simplified version in this step.

## Files for this chapter

Create the following files in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/components.ts` | Create — copy from [`src/components.ts`](./src/components.ts) |
| `test/components.test.ts` | Create — copy from [`test/components.test.ts`](./test/components.test.ts) |

## The code

`src/components.ts` contains:
- `Component` interface
- `Text`, `Box`, `VStack`, `HStack`, `Spacer` implementations
- `Container` — root component with overlay support

## How to test visually

```bash
# Run from pi-from-scratch/
npx tsx src/components.ts
# Renders a sample layout to stdout
```

## Debugging tips

- **Width is wrong**: Components should never exceed the passed `width`. Add an assertion in tests.
- **Box borders are off**: Remember that a box with `width=20` has 18 chars of inner width (2 chars for left/right border).
- **Line count mismatch**: VStack's total lines = sum of all children's line counts. Count them carefully.

## Tests

Run from `pi-from-scratch/`:
```bash
npx vitest --run test/components.test.ts
```

---

Next: [Chapter 05 — LLM Streaming](../05-llm-streaming/README.md)
