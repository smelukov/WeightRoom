# Agent Guidelines

This file describes the codebase conventions and invariants that AI agents must follow when contributing to this project.

## Commands

```bash
npm run dev                # start dev server (http://localhost:5173)
npm run build              # TypeScript check + Vite production build
npm run typecheck          # tsc -b (no emit) — fast type-only check
npm run lint               # ESLint
npm run lint:fix           # ESLint with --fix
npm run test:unit          # Vitest — fast, no browser required
npm run test:unit:coverage # Vitest with v8 coverage (./coverage)
npm run test:e2e           # Playwright — requires dev server or build
npm test                   # both test suites
```

Always run `npm run test:unit` after changing anything in `src/lib/` or `src/hooks/`. Run `npm run test:e2e` after changing UI components. Run `npm run lint` AND `npm run typecheck` before finishing.

A pre-commit hook (`.husky/pre-commit`) runs `lint-staged` (eslint --fix on staged files), `tsc -b`, and the unit suite. Do not bypass with `--no-verify`.

## Architecture

The project is a pure client-side React app. No backend, no API routes.

**Core data flow:**
1. User selects model/quant/context in `ConfigCard`
2. `useCalcResult` (`src/hooks/`) calls `calcLLMRam()` → RAM breakdown
3. `calcDisk()` → storage breakdown
4. `useValueScore` (`src/hooks/`) calls `calcValueScore()` → TPS and cost-efficiency (requires hosting data)
5. Results render in `ResultCard` and `AvailableHardware`
6. State serialized to URL via `encodeState`/`decodeState` (500ms debounce)

## Key Invariants — Do Not Break

### KV cache formulas (`src/lib/calculator.ts`)

There are 4 KV formulas. Each must stay consistent across `calcLLMRam` and `calcValueScore` — both functions implement the same switch. If you change a formula in one, change it in the other.

| Formula | Used by |
|---|---|
| `standard` | Llama, Qwen, Mistral, Phi |
| `hybrid` | Gemma 2/3, Mistral Sliding Window |
| `mla` | DeepSeek V3/R1 |
| `linear_hybrid` | Qwen 3.5 |

### q1 weight overhead factor

```ts
const weightOverhead = quant === "q1" ? 1.0 : 1.1;
```

For Q1 (1-bit / MLX format) the overhead is already baked into `QUANT_BITS["q1"] = 1.25`. All other quants use 1.1 to account for embeddings and norms stored in higher precision. Do not remove this distinction.

### QUANT_BITS vs QUANT_BYTES

`QUANT_BITS` (in `quants.ts`) is used for RAM/disk calculations and works in integer-like bits.
`QUANT_BYTES` (in `calculator.ts`) is used for TPS/bandwidth calculations and uses fractional bytes per parameter.
They are separate for a reason — do not merge them.

### URL state encoding

`encodeState`/`decodeState` in `src/lib/state.ts` use UTF-8 → base64url (no `+`, `/`, `=`). The encoding must remain stable — any change that breaks decoding of existing URLs is a breaking change for shared links.

### parseHfUrl

The regex must stop at `?`, `#`, and whitespace. Do not simplify it to `[^/]+` — that would include query params in the repo ID and cause 404s on HF API calls.

### `engineId` ⇄ `kvCacheFillPct` synchronisation

`ModelSettings.engineId` (a stable string id like `"llamacpp"` / `"vllm"` / `"tensorrt"` / `"custom"`) and `ModelSettings.kvCacheFillPct` (the numeric value used by `calcLLMRam` / `calcValueScore`) must stay in sync. The parent (`ConfigCard`) is responsible:

- selecting an engine preset → update **both** `engineId` AND `kvCacheFillPct` in one `setState`
- typing in the manual % input → update `kvCacheFillPct` AND stamp `engineId: "custom"`

`resolveActiveEngine` in `src/lib/enginePresets.ts` is the single source of truth for "which preset is active" — if `engineId` matches a preset but `pct` disagrees, it falls back to Custom rather than silently lying with the wrong label. Keep that behaviour.

`engineId` is intentionally optional in `ModelSettings` for backward compatibility with shared URLs created before this field existed; the UI falls back to pct-based matching when it is `undefined`. Do not make it required.

### TypeScript strictness

`tsconfig.app.json` and `tsconfig.node.json` enable `strict`, `noImplicitOverride`, `noImplicitReturns`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Do not relax these flags — fix the underlying code instead. In particular:

- `field?: T` does NOT mean the field can be set to `undefined`. If a caller wants to pass `undefined` explicitly, the type must read `field?: T | undefined`.
- Array / object index access returns `T | undefined` — narrow with explicit guards (`if (!item) return;`) or `?? fallback`. Do not use non-null assertions (`!`).
- Avoid `any` and type casts. If a third-party type forces a cast, isolate it behind a typed helper.

## File Responsibilities

| File | What it does | What it must NOT do |
|---|---|---|
| `lib/calculator.ts` | Pure math functions only | No React, no fetch, no DOM |
| `lib/scoring.ts` | UI scoring utils: score normalization, color mapping, TPS labels | No React, no fetch |
| `lib/models.ts` | Static model catalog (KNOWN_MODELS, getModelGroups) | No formulas, no fetch |
| `lib/quants.ts` | Quantization constants: QUANT_BITS, WEIGHT_QUANTS, KV_QUANTS | No model data, no logic |
| `lib/calcInput.ts` | `resolveModel` + assemble `CalcOptions` / `ValueScoreInput` from a `CardData` | No formulas, no fetch, no React |
| `lib/enginePresets.ts` | Engine preset catalog + `resolveActiveEngine` | No React, no fetch (must remain pure to be shared by UI and Footer) |
| `lib/hf.ts` | Fetch HF config, detect formula/precision/activeParams | No React state, no routing |
| `lib/state.ts` | URL encode/decode only | No fetch, no React hooks |
| `lib/screenshot.ts` | PNG export via html-to-image | No React state, no formulas |
| `lib/types.ts` | Type definitions only | No logic |
| `hooks/useCalcResult.ts` | Memoized RAM calculation for a card config | No side effects, no fetch |
| `hooks/useValueScore.ts` | Memoized TPS / value score for a card config | No side effects, no fetch |
| `hooks/useHfModelImport.ts` | HF fetch flow with loading/error/warning state | No JSX, no URL state |
| `components/ConcurrentUsersInput.tsx` | Users + engine dropdowns; delegates "which preset is active" to `resolveActiveEngine` | No formulas; must NOT export non-component values (kills react-refresh) |

> **`components/ui/*`** — shadcn/ui primitives, configured via `components.json` (style `base-nova`, alias `@/components/ui`). To add a new primitive run `npx shadcn add <name>` — do NOT hand-write or hand-edit files in `ui/`, otherwise `npx shadcn diff` / future upgrades will silently overwrite your changes. If you really need a project-specific tweak, wrap the primitive in a sibling component (e.g. `InfoTooltip.tsx` wraps `ui/tooltip`).

### Icons

Single source for all icons in **our** code: [`react-icons`](https://react-icons.github.io/react-icons/).

- UI / outline icons → `react-icons/lu` (Lucide). Example: `import { LuCamera, LuChevronDown } from "react-icons/lu";`
- Brand / logo icons → `react-icons/si` (Simple Icons, 3000+ brands). Example: `import { SiGithub, SiHuggingface } from "react-icons/si";`
- Always pass `aria-hidden="true"` for purely decorative icons (the surrounding `<button>`/`<a>` already provides the accessible name via `aria-label` or visible text).
- Do NOT add `lucide-react` imports to files outside `src/components/ui/*`. `lucide-react` stays in `dependencies` only because shadcn/ui primitives import from it directly — the rest of the codebase uses `react-icons` so we keep one icon convention everywhere.
- Avoid inline `<svg>` markup in components — search `react-icons/{lu,si,md,fa,hi}` first; if nothing fits, add a tiny wrapper component in `src/components/icons/` rather than copy-pasting raw paths into JSX.
- The only **legitimate** inline `<svg>` in the codebase lives in `BrandIcon.tsx` (Microsoft / DeepSeek). They are intentionally absent from Simple Icons due to trademark restrictions, so we ship custom replicas. Brand colours for the rest are mirrored from the simple-icons palette and live next to `BRAND_ICONS` — that lets us keep `react-icons/si` as the single brand-icon source and avoid a separate `simple-icons` dependency.

## Testing Conventions

- Tests live in `src/{lib,hooks,components}/__tests__/*.test.{ts,tsx}` (unit) and `e2e/*.spec.ts` (e2e). Use `.tsx` only when the test renders JSX.
- Unit tests use **Vitest** with `describe`/`it`/`expect`. Do not use Jest APIs.
- `src/test-setup.ts` wires `@testing-library/jest-dom` matchers — that gives you `toHaveTextContent`, `toBeInTheDocument`, etc. Do not register matchers per-file.
- Component tests use `@testing-library/react` (+ `@testing-library/user-event` for click flows). Hook tests use `renderHook` from the same package.
- Tests must find **real bugs**, not just document current behavior. If a test would pass even with a broken implementation, rewrite it with tighter assertions. When you hit an existing bug that you cannot fix in scope, document it with a `KNOWN QUIRK:` comment so the next change is conscious.
- Avoid mocking what you can compute directly. For `fetchHfConfig` tests, mock only `fetch` globally via `vi.stubGlobal("fetch", vi.fn())` and restore with `vi.unstubAllGlobals()` in `afterEach`. For `useHfModelImport` mock `fetchHfConfig` itself via `vi.mock("@/lib/hf", …)`.
- Do not use `any` or type casts unless absolutely necessary.
- E2E tests use `data-slot` attributes for stable locators on UI primitives (e.g. `[data-slot="combobox-trigger"]`, `[data-slot="select-item"]`, `[data-slot="card-content"]`). Use `getByPlaceholder` for the combobox search input since it has no `data-slot`.
- When a card contains **multiple instances of the same primitive** (e.g. several `Select`s — Weights Quant, KV Cache Quant, Concurrent Users, Inference Engine), do NOT address them by `nth()` — that breaks the moment a new control is added. Add a semantic `data-testid` to each trigger (e.g. `data-testid="weights-quant-trigger"`) and locate via `[data-testid="…"]`, optionally scoped inside `[data-slot="card-content"].nth(cardIndex)` for compare mode.

## Adding a New KV Formula

1. Add the new variant to the `KvFormula` union type in `src/lib/types.ts`
2. Add a `case` to the `switch (formula)` in `calcLLMRam` in `src/lib/calculator.ts`
3. Add the same `case` to the `switch (formula)` in `calcValueScore` in `src/lib/calculator.ts`
4. Add the formula label to `KV_FORMULA_LABELS` in `src/components/ResultCard.tsx`
5. Add the option to `FORMULA_OPTIONS` in `src/components/CustomModelForm.tsx`
6. Add formula detection logic to `detectFormula` in `src/lib/hf.ts` if it can be auto-detected from HF config
7. Write unit tests for the new formula in `src/lib/__tests__/calculator.test.ts`

## Adding a New Known Model

1. Add an entry to `KNOWN_MODELS` in `src/lib/models.ts`
2. Required fields: `displayName`, `brand`, `params`, `layers`, `kvHeads`, `headDim`, `moe`, `maxContextK`
3. Optional but important: `hfRepoId`, `kvFormula` (defaults to `"standard"`), `capabilities`
4. For hybrid: add `fullLayers`, `slidingWindow`, optionally `fullKvHeads`, `fullHeadDim`, `kvFactor`
5. For MLA: add `kvLoraRank`, `qkRopeHeadDim`
6. For linear_hybrid: add `fullLayers`
7. For MoE: set `moe: true` and `activeParams`. **`displayName` must follow the `<Brand> <Model> <Total>B-A<Active>B (MoE)` convention** (e.g. `"Qwen 3 235B-A22B (MoE)"`, `"DeepSeek V3 671B-A37B (MoE)"`). For models with established marketing names containing the expert grid (Mixtral `8x7B`, `8x22B`), keep that name and append `-A<Active>B` (e.g. `"Mixtral 8x7B-A13B (MoE)"`). Round to the nearest integer B.
8. Run `npm run test:unit` — no tests should break

## PR Checklist

- [ ] `npm run lint` passes with no new errors
- [ ] `npm run typecheck` passes (no relaxing of strict flags)
- [ ] `npm run test:unit` — all 200+ tests green
- [ ] `npm run test:e2e` — all 24+ tests green
- [ ] `npm run build` succeeds
- [ ] If a formula changed: both `calcLLMRam` and `calcValueScore` updated consistently
- [ ] If a new model added: `displayName`, `brand`, and `hfRepoId` are set; MoE follows the `<Total>B-A<Active>B (MoE)` naming convention
- [ ] If `engineId` / `kvCacheFillPct` touched: parent updates BOTH in one `setState`
- [ ] No `any` types introduced, no non-null assertions (`!`)
- [ ] No `console.log` left in production code

CI mirrors this list as separate jobs in `.github/workflows/ci.yml` (lint, typecheck, unit + coverage, build, e2e). All must be green to merge.
