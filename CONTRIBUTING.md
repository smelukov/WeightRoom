# Contributing to WeightRoom

Thank you for your interest in contributing! WeightRoom is an open-source LLM resource calculator, and we welcome contributions of all kinds — new models, formula improvements, UI enhancements, bug fixes, and documentation updates.

## Quick Start

```bash
git clone https://github.com/<your-fork>/WeightRoom.git
cd WeightRoom
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the app.

## Before You Start

1. **Check existing issues** — someone may already be working on the same thing.
2. **Open an issue first** for non-trivial changes (new features, refactors, formula changes). This avoids wasted effort if the approach needs discussion.
3. **Small, focused PRs** are easier to review. One logical change per PR.

## Development Workflow

### Branch Naming

Use descriptive branch names:
- `feat/add-cohere-models` — new feature
- `fix/kv-cache-hybrid-rounding` — bug fix
- `docs/update-readme` — documentation
- `refactor/extract-scoring-utils` — refactoring

### Running Tests

```bash
npm run lint          # ESLint — must pass with no new errors
npm run test:unit     # Vitest — fast, no browser required (~1s)
npm run test:e2e      # Playwright — needs built app or dev server
npm test              # both suites
```

**When to run what:**
- Changed anything in `src/lib/` → `npm run test:unit`
- Changed UI components → `npm run test:e2e`
- Before pushing → `npm run lint && npm test`

### CI

Every PR triggers two GitHub Actions jobs:
1. **Unit Tests** — lint + Vitest
2. **E2E Tests** — Playwright on Chromium

Both must pass before merge. If E2E fails, the Playwright HTML report is uploaded as an artifact.

## Common Contribution Types

### Adding a New Model

This is the most common and easiest contribution. No tests need updating.

1. Find the model's `config.json` on HuggingFace (e.g. [Llama 3.1 8B](https://huggingface.co/meta-llama/Llama-3.1-8B/blob/main/config.json))
2. Open `src/lib/models.ts` and add an entry to `KNOWN_MODELS`:

```ts
"my-model-7b": {
  displayName: "My Model 7B",
  brand: "Meta",                    // existing brand from ModelBrand type
  hfRepoId: "org/my-model-7b",     // for the HF link button
  params: 7e9,                      // total parameter count
  layers: 32,                       // num_hidden_layers
  kvHeads: 8,                       // num_key_value_heads (NOT num_attention_heads!)
  headDim: 128,                     // head_dim or hidden_size / num_attention_heads
  moe: false,                       // true for Mixture-of-Experts models
  maxContextK: 128,                 // max context length in K (128 = 128K tokens)
  capabilities: { vlm: false, thinking: true, toolUse: true },
},
```

**Architecture-specific fields:**
- **Hybrid** (Gemma): add `kvFormula: "hybrid"`, `fullLayers`, `slidingWindow`, optionally `fullKvHeads`, `fullHeadDim`, `kvFactor`
- **MLA** (DeepSeek): add `kvFormula: "mla"`, `kvLoraRank`, `qkRopeHeadDim`
- **Linear + Full** (Qwen 3.5): add `kvFormula: "linear_hybrid"`, `fullLayers`

3. Run `npm run test:unit` — no tests should break
4. **Important:** use `num_key_value_heads`, not `num_attention_heads`. GQA models typically have 4–8× fewer KV heads.

> **Adding a new brand?** Add the brand to the `ModelBrand` type in `src/lib/types.ts`, then add a `{ key, label }` entry to `MODEL_BRANDS` in `src/lib/models.ts`. You'll also need an SVG icon in `src/components/BrandIcon.tsx`.

### Adding a New KV Cache Formula

This is more involved and requires careful attention to invariants.

1. Add the new variant to `KvFormula` in `src/lib/types.ts`
2. Add a `case` to **both** `switch (formula)` blocks:
   - `calcLLMRam` in `src/lib/calculator.ts` (RAM calculation)
   - `calcValueScore` in `src/lib/calculator.ts` (TPS calculation)
   - **These two switches must stay in sync** — this is a key invariant
3. Add the formula label to `KV_FORMULA_LABELS` in `src/components/ResultCard.tsx`
4. Add a UI option to `FORMULA_OPTIONS` in `src/components/CustomModelForm.tsx`
5. Add auto-detection logic to `detectFormula` in `src/lib/hf.ts` (if applicable)
6. Write unit tests in `src/lib/__tests__/calculator.test.ts`

### Fixing a Bug

1. Write a failing test first (if the bug is in `src/lib/`)
2. Fix the bug
3. Verify the test now passes
4. For UI bugs, add or update an E2E test in `e2e/`

### UI Changes

- We use **Tailwind CSS 4** for styling — no CSS modules or styled-components
- Headless components come from **Base UI** (`@base-ui/react`)
- Icons come from **Lucide React** — check existing icons before adding new ones
- The app is dark-mode only
- Responsive breakpoints: mobile-first, `sm:` for tablet+

## Code Style

### TypeScript

- **No `any`** — use proper types or `unknown` with narrowing
- **No type casts** (`as`) unless absolutely unavoidable
- **Prefer `null` over `undefined`** for "no value" returns (except for `void` functions)
- Add JSDoc comments to exported functions and types

### React

- **Functional components only** — no class components
- Use `memo()` for components that receive complex objects as props
- Custom hooks live in `src/hooks/` — extract hooks when component logic gets complex
- Components should be focused: if a file grows past ~300 lines, consider splitting

### Testing

- Unit tests use **Vitest** (`describe`/`it`/`expect`) — do **not** use Jest APIs
- Tests should find real bugs, not just document current behavior
- **Avoid mocks** when you can compute directly. Mock only `fetch` for network tests
- E2E tests use `data-slot` attributes for stable locators
- No `any` in tests either

### File Organization

Each file has a clear responsibility — see the table in [AGENTS.md](AGENTS.md#file-responsibilities). The key rule: **pure math stays in `lib/`, React stays in `components/` and `hooks/`**.

## Project Architecture

```
User input → ConfigCard
               ├── useCalcResult hook → calcLLMRam() → RAM breakdown
               ├── calcDisk()                        → Storage breakdown
               ├── useValueScore hook → calcValueScore() → TPS estimate
               └── Results render in ResultCard + AvailableHardware

State ←→ URL via encodeState/decodeState (500ms debounce)
```

The app is **100% client-side** — no backend, no API routes, no server state. The only network call is the optional HuggingFace `config.json` fetch for custom model import.

## Key Invariants

These are things that **must not break** — CI won't catch all of them:

1. **KV formula sync** — `calcLLMRam` and `calcValueScore` both have a `switch (formula)`. They must match.
2. **Q1 overhead** — Q1 uses `weightOverhead = 1.0` (overhead baked into `QUANT_BITS["q1"] = 1.25`), all others use `1.1`.
3. **QUANT_BITS vs QUANT_BYTES** — they serve different purposes (bits for RAM/disk, bytes for TPS). Don't merge them. They MUST stay numerically aligned (`QUANT_BYTES[q] ≈ QUANT_BITS[q] / 8`); a parameterised test in `calculator.test.ts` enforces this.
4. **QUANT_SPECS is the single source of truth** for quants — when adding a new family or bit-width, update `QUANT_SPECS` (with `family`, `familyLabel`, `bpw`), `QUANT_BYTES` (calculator.ts), and — if a new family is introduced — extend `QUANT_FAMILY_ENGINES` and the engine-filter test in `ConcurrentUsersInput.test.tsx`.
5. **Engine ⇄ quant compatibility** — UI filtering and auto-snap both go through `QUANT_FAMILY_ENGINES` + `pickCompatibleEngine`. If you change the matrix, update both the unit tests and the ENGINE_TOOLTIP / WEIGHTS_TOOLTIP copy.
6. **URL encoding stability** — changing `encodeState`/`decodeState` breaks existing shared links. Golden-URL tests in `src/lib/__tests__/state.test.ts` guard this. New `QuantName` values are safe to add — they're stored as opaque strings, no encoder change needed.
7. **parseHfUrl regex** — must stop at `?`, `#`, whitespace. Don't simplify.
8. **MoE effective params** — TPS/bandwidth use `activeParams` (or `params` for dense); RAM/disk always use total `params`. Keep this asymmetry explicit.
9. **HF auto-detection priority** — `quantization_config` (AWQ/GPTQ method+bits) wins over safetensors dtype, which in turn distinguishes MLX repos by org prefix / `mlx` tag. Keep the priority order intact in `fetchHfConfig`.

## PR Checklist

Before requesting review, make sure:

- [ ] `npm run lint` passes with no new errors
- [ ] `npm run test:unit` — all 112+ tests green
- [ ] `npm run test:e2e` — all 24+ tests green
- [ ] If a formula changed: both `calcLLMRam` and `calcValueScore` updated consistently
- [ ] If a new model added: `displayName`, `brand`, and `hfRepoId` are set
- [ ] If URL encoding changed: **golden-URL tests still pass** (or the change is versioned in `decodeState`)
- [ ] For MoE models: `activeParams` is set (either in the catalog entry or estimated in `hf.ts`)
- [ ] No `any` types introduced
- [ ] No `console.log` left in production code
- [ ] Commit messages are descriptive (what + why, not just "fix bug")

## Getting Help

- Open an issue with the **question** label
- For formula questions, include a link to the model's `config.json` on HuggingFace
- For UI bugs, include a screenshot or screen recording

Thank you for contributing!
