# Step 00 — Environment Setup

## Goal

Set up a TypeScript project that can run the code from the following steps. You only need to do this once.

## 1. Create the project folder

Run this **outside** the pi-mono repository, anywhere on your machine:

```bash
mkdir pi-from-scratch && cd pi-from-scratch
npm init -y
```

`npm init -y` creates `package.json` with defaults. You will edit it in a moment.

## 2. Install dependencies

```bash
# TypeScript and runner
npm install -D typescript tsx vitest @types/node

# LLM SDKs (install whichever provider you want to use)
npm install @anthropic-ai/sdk      # Anthropic / Claude
npm install openai                  # OpenAI / GPT

# Schema validation (TypeBox — same as the real project)
npm install @sinclair/typebox
```

## 3. Edit package.json

After `npm init -y` and installing dependencies, your `package.json` will look like this:

```json
{
  "name": "pi-from-scratch",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "devDependencies": {
    "@types/node": "^25.5.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "@sinclair/typebox": "^0.34.48",
    "openai": "^6.32.0"
  }
}
```

Make two changes:

1. Change `"type": "commonjs"` to `"type": "module"` — this enables ES module syntax (`import`/`export`) which the tutorial code uses throughout.
2. Replace the `"scripts"` block with vitest commands.

The final `package.json` should look like this:

```json
{
  "name": "pi-from-scratch",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "vitest --run",
    "test:watch": "vitest"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "devDependencies": {
    "@types/node": "^25.5.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "@sinclair/typebox": "^0.34.48",
    "openai": "^6.32.0"
  }
}
```

## 4. Create tsconfig.json

`tsconfig.json` is the configuration file for the TypeScript compiler. It tells TypeScript:
- **what to compile** — which files to include
- **how to compile** — which JavaScript version to target, how to resolve imports, which strictness rules to enforce

Without it, TypeScript doesn't know your project exists and tools like `tsx` and `vitest` will fall back to loose defaults that may not catch type errors.

Create a new file `tsconfig.json` in `pi-from-scratch/` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

What each option does:

| Option | What it does |
|--------|-------------|
| `"target": "ES2022"` | Compile TypeScript down to ES2022 JavaScript (supports modern syntax like `async/await`, `??`, optional chaining) |
| `"module": "NodeNext"` | Use Node.js ES module resolution — required when `package.json` has `"type": "module"` |
| `"moduleResolution": "NodeNext"` | Tells TypeScript how to resolve `import` paths, including requiring `.js` extensions on local imports |
| `"strict": true` | Enables all strict type checks — catches null dereferences, implicit `any`, and more |
| `"noUncheckedIndexedAccess": true` | Array lookups like `arr[0]` return `T \| undefined` instead of `T`, preventing crashes on out-of-bounds access |
| `"esModuleInterop": true` | Lets you `import Anthropic from "@anthropic-ai/sdk"` instead of `import * as Anthropic` for CommonJS packages |
| `"skipLibCheck": true` | Skip type-checking inside `node_modules` — speeds up compilation and avoids errors in third-party types you can't control |
| `"outDir": "dist"` | Compiled `.js` files go into `dist/` instead of next to your source files |
| `"types": ["node"]` | Explicitly include Node.js type definitions, giving TypeScript knowledge of `process`, `Buffer`, `__dirname`, and built-in modules like `fs`, `path`, `os`, and `child_process`. Without this, those globals may not be recognised, especially in monorepo or mixed-target setups. |
| `"include"` | Only compile files under `src/` and `test/` — ignores `node_modules`, `dist`, etc. |

## 5. Set your API key

### Get an API key

You need at least one of these:

- **Anthropic (Claude)** — sign up at https://console.anthropic.com, go to **API Keys**, and create a new key. It starts with `sk-ant-`.
- **OpenAI (GPT)** — sign up at https://platform.openai.com, go to **API Keys**, and create a new key. It starts with `sk-`.

**Important:** an API key alone is not enough — you also need to add credits to your account. A Claude Pro or ChatGPT Plus subscription does **not** include API credits; the API is billed separately.

- Anthropic API credits: https://console.anthropic.com/settings/billing
- OpenAI API credits: https://platform.openai.com/settings/organization/billing

The tutorial uses small models (`claude-haiku-4-5` / `gpt-4o-mini`) so costs are minimal — a full run through all chapters typically costs less than $0.10.

If you already subscribe to Claude Pro/Max and prefer not to buy API credits, [Chapter 11 — Auth](../11-auth/README.md) covers how to run a one-time login that saves an OAuth token to disk — no API credits needed.

### Set the key in your terminal

Run this in the same terminal session where you will run the tutorial code:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# or
export OPENAI_API_KEY="sk-..."
```

This sets an environment variable for the current terminal session only. If you open a new terminal window, you will need to run it again. To avoid that, add the line to your shell's startup file (`~/.zshrc` on macOS or `~/.bashrc` on Linux), then run `source ~/.zshrc` to apply it.

Tests that call real LLM APIs are skipped when the env var is absent, so the rest of the tutorial works without an API key.

## 6. Verify setup

```bash
mkdir src
echo 'console.log("Hello, pi!")' > src/hello.ts
npx tsx src/hello.ts
# Hello, pi!
```

## Project structure after this step

```
pi-from-scratch/
├── node_modules/          ← created by npm install
├── package.json           ← edited in step 3
├── package-lock.json      ← created by npm install
├── tsconfig.json          ← created in step 4
└── src/
    └── hello.ts           ← created in step 6 (can delete after verifying)
```

As you work through each tutorial chapter, you will add files under `src/` and `test/`. By chapter 10 the full structure will look like:

```
pi-from-scratch/
├── node_modules/
├── package.json
├── package-lock.json
├── tsconfig.json
├── src/
│   ├── terminal.ts        ← chapter 01
│   ├── renderer.ts        ← chapter 02
│   ├── keys.ts            ← chapter 03
│   ├── components.ts      ← chapter 04
│   ├── event-stream.ts    ← chapter 05
│   ├── ai.ts              ← chapter 05
│   ├── auth.ts            ← chapter 11 (optional — API key or OAuth)
│   ├── providers/
│   │   ├── anthropic.ts   ← chapter 05 (updated in chapter 11)
│   │   └── openai.ts      ← chapter 05
│   ├── tools.ts           ← chapter 06
│   ├── agent-loop.ts      ← chapter 07
│   ├── tools/
│   │   ├── read.ts        ← chapter 08
│   │   ├── write.ts       ← chapter 08
│   │   ├── bash.ts        ← chapter 08
│   │   └── edit.ts        ← chapter 08
│   ├── session.ts         ← chapter 09
│   └── interactive.ts     ← chapter 10
└── test/
    ├── terminal.test.ts   ← chapter 01
    ├── renderer.test.ts   ← chapter 02
    ├── keys.test.ts       ← chapter 03
    ├── components.test.ts ← chapter 04
    ├── event-stream.test.ts ← chapter 05
    ├── tools.test.ts      ← chapter 06
    ├── agent-loop.test.ts ← chapter 07
    ├── builtin-tools.test.ts ← chapter 08
    ├── session.test.ts    ← chapter 09
    └── auth.test.ts       ← chapter 11 (optional)
```

---

Next: [01 — Terminal Basics](../01-terminal-basics/README.md)
