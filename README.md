[![WeightRoom — LLM Hardware Calculator](./public/weightroom-badge.svg)](https://smelukov.github.io/WeightRoom/)

# WeightRoom

A web calculator that estimates RAM, storage, and token throughput (TPS) for running large language models locally or in the cloud.

🔗 **Live demo:** https://smelukov.github.io/WeightRoom/

## Features

- **RAM estimation** — weights + KV cache + OS overhead, accurate for any context length and batch size
- **4 KV cache formulas** — Standard GQA, Sliding Window (Gemma), MLA (DeepSeek), Linear+Full (Qwen 3.5)
- **Storage estimation** — quantized model file + OS overhead
- **TPS / value score** — estimates token throughput and cost-efficiency based on GPU/CPU memory bandwidth
- **MoE support** — Mixture-of-Experts models (Mixtral, Qwen3-MoE, DeepSeek V3 …) compute TPS from **active** parameters while RAM/disk reflect **total** parameters
- **34 pre-configured models** — Qwen, Llama, Gemma, Mistral, DeepSeek, Phi and others
- **HuggingFace import** — paste any HF URL to auto-fill architecture parameters from `config.json` (including MoE fields like `num_local_experts`, `num_experts_per_tok`, `n_routed_experts`)
- **Compare mode** — side-by-side comparison of multiple configurations with charts
- **Screenshots** — export single card or full comparison as PNG (2× retina)
- **URL sharing** — full state (model, quant, context, hosting) serialized to `?s=` URL parameter (backward-compatibility guarded by golden-URL tests)
- **Share & Embed** — one-click dialog to generate social-ready PNGs (OG 1200×630, Square, Story), README badges (shields.io-style SVG + mini-card), and live `<iframe>` embed snippets. See [Embed & Share](#embed--share)
- **Quantization support** — five families covered:
  - **Float**: FP32 / BF16 / FP16
  - **GGUF** (llama.cpp / Ollama): Q8_0, Q6_K, Q5_K_M, Q4_K_M, Q3_K_M, Q2_K, Q1_0
  - **MLX** (Apple Silicon, g64): MLX 8-bit / 4-bit / 3-bit / 2-bit
  - **GPTQ** (vLLM / ExLlama, g128): 8-bit / 4-bit / 3-bit
  - **AWQ** (vLLM / AutoAWQ, g128): 4-bit
  - KV cache quants: BF16, FP16, Q8_0, Q4
- **Concurrent users + inference engine** — KV cache scales by parallel slots and engine pre-allocation strategy (llama.cpp / Ollama / MLX = 100% reservation; vLLM / SGLang / TGI PagedAttention ≈ 25%; TensorRT-LLM ≈ 30%; or a custom %). The engine dropdown is filtered by the selected quant family — picking AWQ/GPTQ hides CPU runtimes, picking GGUF/MLX hides PagedAttention engines (use `Custom KV %` as an escape hatch).
- **Light / Dark / System theme** — `next-themes` switcher in the header, with an inline anti-flash bootstrap so the page never paints in the wrong theme. All component colours go through semantic design tokens (`success`, `warning`, `info`, `cat-vision`, …) defined in `src/index.css`, so adding a new colour automatically works in both themes

## KV Cache Formulas


| Formula            | Architecture                      | Equation                                                         |
| ------------------ | --------------------------------- | ---------------------------------------------------------------- |
| **Standard**       | Most LLMs (Llama, Qwen, Mistral…) | `2 × L × H_kv × d_head × T × bytes`                              |
| **Sliding Window** | Gemma 2/3, Mistral Sliding        | local layers use `min(T, sw)` tokens; global layers use full `T` |
| **MLA**            | DeepSeek V3 / R1                  | `L × (rank + rope_dim) × T × bytes` — joint K+V latent           |
| **Linear + Full**  | Qwen 3.5                          | only sparse full-attention layers have a growing KV cache        |


> The key insight: modern models use **GQA** — always use `num_key_value_heads` (not `num_attention_heads`) in the formula. It's typically 4–8× smaller.

## Embed & Share

WeightRoom configurations are URL-encoded (no account, no backend) — share a link, paste a live widget into your blog, or drop a static badge into a README.

Open any configuration in the calculator, click the **Share** button in the header, and pick one of four tabs:

### 1. Link

Copies a URL with the entire state (`?s=<base64url>`). Anyone who opens it sees the exact same configuration.

### 2. Image

Generates a 2× retina PNG in three canonical sizes:

- **Twitter / LinkedIn (OG)** — 1200×630, ideal for link previews in feeds
- **Square** — 1080×1080, for Instagram / LinkedIn square
- **Story** — 1080×1920, for Stories / Shorts / Reels

Pick **Dark** or **Light** theme, optionally include a QR code linking back to the live calculator, then copy to clipboard or download.

### 3. Badge (for READMEs)

Two styles:

- **Shield** — narrow shields.io-style SVG. Three themes: **Universal** (adapts to GitHub's light/dark README via `currentColor`), **Light**, **Dark**. True vector, ~600 bytes.
- **Card** — compact mini-card with logo, model, RAM, and TPS. PNG or SVG.

Output is a ready-to-paste Markdown snippet with `data:image/svg+xml;base64,…` (no separate asset file needed).

### 4. Embed (live widget)

Generates an `<iframe>` snippet pointing to `embed.html`:

```html
<iframe
  src="https://smelukov.github.io/WeightRoom/embed.html?s=…&theme=auto"
  width="100%" height="220" frameborder="0" loading="lazy"
  title="WeightRoom widget"
></iframe>
```

The embed bundle is ~83 KB gzipped (separate Vite entry, doesn't ship the whole app) and renders a read-only card identical to what you see in the calculator. Your readers see the same RAM / Storage / TPS you see, live. Theme picker supports `auto` (matches host's `prefers-color-scheme`), `light`, or `dark`.

> Badges are a **static snapshot** at export time — if WeightRoom's formulas update later, existing badges in READMEs won't auto-refresh. The live `<iframe>` always reflects current math.

## Getting Started

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Tech Stack


| Layer               | Library                    |
| ------------------- | -------------------------- |
| UI framework        | React 19                   |
| Build tool          | Vite 8 (multi-entry: main app + embed widget) |
| Styling             | Tailwind CSS 4             |
| Headless components | Base UI (`@base-ui/react`) |
| Charts              | Recharts                   |
| Image capture       | `html-to-image` (PNG / SVG share-cards) |
| QR codes            | `qrcode.react`             |
| Language            | TypeScript 6               |


## Development

```bash
npm run dev                # start dev server
npm run build              # type-check + production build (both entry points)
npm run typecheck          # tsc -b (no emit)
npm run lint               # ESLint
npm run lint:fix           # ESLint with --fix
npm run test:unit          # Vitest unit tests (watch: npm run test:unit:watch)
npm run test:unit:coverage # Vitest with v8 coverage report (./coverage)
npm run test:e2e           # Playwright e2e tests (requires running dev server or build)
npm test                   # unit + e2e
```

A pre-commit hook (`husky` + `lint-staged`) runs `eslint --fix`, `tsc -b` and the unit suite on staged files before each commit.

## Deployment

The site is deployed to GitHub Pages on every push to `main` via `.github/workflows/deploy.yml`. A Hugging Face Space mirror at `https://huggingface.co/spaces/smelukov/WeightRoom` is kept in sync by `.github/workflows/deploy-hf-space.yml`.

- Project Pages URL: `https://smelukov.github.io/WeightRoom/`
- Both workflows ship the entire `dist/` folder, which means **`embed.html` is automatically deployed** alongside `index.html` (multi-entry Vite build) — no extra steps.
- Vite reads `process.env.VITE_BASE` at build time. The workflow sets `VITE_BASE=/WeightRoom/` so all asset URLs get the subpath prefix; locally `npm run build` defaults to `/`.
- To switch to a custom apex domain (e.g. `weightroom.dev`): drop the `VITE_BASE` env from the workflow, add a `public/CNAME` file with the domain, and configure the DNS `CNAME` record. No source changes needed.
- First-time setup (only once per repo): GitHub → Settings → Pages → Source: **GitHub Actions**.

## Project Structure

```
embed.html                 # second Vite entry — loads src/embed/main.tsx
index.html                 # main app entry
public/
  weightroom-badge.svg     # self-hosted README shield shown above
src/
  test-setup.ts            # registers @testing-library/jest-dom matchers + ResizeObserver mock
  main.tsx                 # main app bootstrap
  App.tsx                  # root component (state, routing, layout)
  embed/                   # Embed widget (separate Vite chunk, ~83 KB gzip)
    main.tsx               # decodes ?s=<card> and mounts read-only <EmbedCard>
    EmbedCard.tsx          # minimal read-only card + EmbedFallback
    index.css              # scoped Tailwind-based styles
  share/                   # Share modal, share-card templates, shield generator
    ShareModal.tsx         # dialog with Link / Image / Badge / Embed tabs
    ShareCard.tsx          # offscreen DOM template captured by html-to-image
    formats.ts             # declarative format metadata (OG / Square / Story / card-badge / shield)
    shieldSvg.ts           # handwritten SVG string generator for shields.io-style badges
    __tests__/
      ShareModal.test.tsx  # tab switching, snippet generation, card picker
      shieldSvg.test.ts    # width math, theme palettes, XML escaping, metric variants
  lib/
    calculator.ts          # pure math: calcLLMRam, calcDisk, calcValueScore
    scoring.ts             # UI scoring utils: normalizeScores, getValueColor, getTpsLabel
    models.ts              # static model catalog (KNOWN_MODELS, getModelGroups)
    quants.ts              # QUANT_SPECS source-of-truth + QUANT_BITS, QUANT_FAMILY_ENGINES, getQuantFamily, getWeightQuantGroups
    calcInput.ts           # resolveModel + input assembly for calc hooks
    enginePresets.ts       # inference-engine presets + resolveActiveEngine + pickCompatibleEngine (auto-snap)
    hf.ts                  # HuggingFace config.json fetching + formula + activeParams detection
    state.ts               # URL state serialization: encodeState / decodeState / encodeStateForEmbed
    screenshot.tsx         # PNG/SVG export via html-to-image (incl. renderShareCardToBlob/DataUrl/Svg)
    types.ts               # shared TypeScript types
    __tests__/
      calculator.test.ts   # all 4 KV formulas + parity invariant + MoE
      calcInput.test.ts    # input assembly + parity invariant
      state.test.ts        # round-trips, Unicode, malformed input, golden URLs, embed state
      hf.test.ts           # config.json + formula + MoE activeParams (mocked fetch)
  hooks/
    useCalcResult.ts       # memoized RAM / disk calc for a card config
    useValueScore.ts       # memoized TPS / value score for a card config
    useHfModelImport.ts    # HF fetch flow with loading / error / warning state
    __tests__/
      useCalcResult.test.ts
      useValueScore.test.ts
      useHfModelImport.test.ts # incl. race conditions and StrictMode regression
  components/
    ConfigCard.tsx           # single calculator card (model + hosting + results)
    ComparisonPanel.tsx      # compare mode grid + charts
    ModelSelector.tsx        # combobox with HF URL paste support
    QuantSelector.tsx        # weights + KV quant dropdowns
    ContextSlider.tsx        # logarithmic context length slider
    ResultCard.tsx           # RAM + storage display with stacked bars
    AvailableHardware.tsx    # hosting info, TPS, value score
    CustomModelForm.tsx      # manual / HF-imported custom model fields (incl. MoE)
    CapabilityBadges.tsx     # VLM / Thinking / Tool-use capability pills
    ConcurrentUsersInput.tsx # parallel users + inference-engine controls
    InfoTooltip.tsx          # accessible "?" tooltip wrapper
    Header.tsx               # app title, mode toggle, Share button (opens ShareModal), screenshot, theme toggle
    Footer.tsx               # expandable "How calculations work" panel
    ThemeProvider.tsx        # next-themes wrapper (mounted once around <App />)
    ThemeToggle.tsx          # Light / Dark / System dropdown shown in the header
    ui/
      dialog.tsx             # shadcn-style wrapper around @base-ui/react Dialog (used by ShareModal)
      …                      # button, input, label, dropdown-menu etc.
    comparison/
      ModelsChart.tsx        # Memory/Speed bar chart
      HostingDetailsView.tsx # per-provider bar charts + fit status
      HostingScatterView.tsx # scatter plot (price vs TPS)
      utils.ts               # shared chart helpers and constants
    __tests__/
      ConcurrentUsersInput.test.tsx # presets, custom mode, dropdown UX, resolveActiveEngine
      ThemeToggle.test.tsx          # Light / Dark / System persistence + class application
e2e/
  single.spec.ts
  compare.spec.ts
  share.spec.ts
  hf-import.spec.ts
  theme.spec.ts                # theme switcher: default, persistence, system tracking
.github/workflows/
  ci.yml                       # CI jobs: lint, typecheck, unit (with coverage), build, e2e
  deploy.yml                   # deploy dist/ (incl. embed.html) to GitHub Pages
  deploy-hf-space.yml          # mirror dist/ to Hugging Face Space
.husky/
  pre-commit                   # lint-staged + tsc -b + unit tests
vite.config.ts                 # multi-entry config (main + embed)
```

## Testing

Tests are a first-class citizen — every PR is gated by CI (`lint`, `typecheck`, `unit + coverage`, `build`, `e2e`).

**Unit tests** (237 across `src/{lib,hooks,components,share}/__tests__/`) cover:

- `**lib/calculator**` — all 4 KV formulas with exact numeric assertions + cross-formula matrix; `calcLLMRam` ↔ `calcValueScore` **parity** (both switch statements must agree on KV-cache size); `calcValueScore` TPS path with MoE `activeParams`, MLA arch-data path, price sensitivity; `getRamStatus` / `getDiskStatus` / `getRecommendedInstance` (incl. zero-available-resources guards)
- `**lib/calcInput**` — `resolveModel` priority (custom > known > null), `getCalcOptions` / `getValueScoreInput` 1:1 forwarding, AGENTS.md parity invariant for input builders
- `**lib/state**` — `encodeState` / `decodeState` round-trips, Unicode, malformed input, **golden-URL** backward-compat, plus `encodeStateForEmbed` / `decodeStateForEmbed` for the single-card embed URLs
- `**lib/hf**` — `fetchHfConfig` with mocked `fetch`: formula detection, precision detection, MoE `activeParams` estimation, warnings, errors
- `**share/shieldSvg**` — SVG structure, width math, theme palettes, XML escaping, metric variants (tps / ram / summary), `shieldSvgToDataUrl` round-trip
- `**share/ShareModal**` — tab switching (Link / Image / Badge / Embed), snippet generation, card picker visibility, keyed sub-component state reset
- `**hooks/useCalcResult**`, `**useValueScore**` — byte-for-byte match with the underlying calc functions, memoization stability, recomputation on input changes
- `**hooks/useHfModelImport**` — race conditions (stale responses discarded), unmount safety, **StrictMode regression** (`mountedRef` re-init on remount)
- `**components/ConcurrentUsersInput**` — preset matching, custom mode, dropdown UX (real `user-event` clicks), `resolveActiveEngine` truth table incl. backward-compat for legacy URLs without `engineId`
- `**components/ThemeToggle**` — that picking Light / Dark / System actually toggles the `.dark` class on `<html>` and writes the right value to `localStorage` (no shortcut: real `next-themes` provider)

**E2E tests** (`e2e/`) cover:

- Single mode: RAM values, quant change, context change, model change
- Compare mode: chart visibility, card isolation, card limit
- URL sharing: state persistence across tabs
- HF import: network mocking, BF16 detection, error messages
- Theme switcher: default follows OS, Light / Dark choices persist across reload, System tracks `prefers-color-scheme` changes live

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. The short version:

1. Fork → branch → make changes → `npm run lint && npm test` → PR
2. Adding a model? Edit `KNOWN_MODELS` in `src/lib/models.ts` — that's it
3. Changing a formula? Read the [Key Invariants](CONTRIBUTING.md#key-invariants) first

## License

MIT
