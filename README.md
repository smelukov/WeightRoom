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
- **Quantization support** — Q1 / Q2 / Q3 / Q4 / Q5 / Q6 / Q8 / FP16 / BF16 / FP32 for both weights and KV cache
- **Concurrent users + inference engine** — KV cache scales by parallel slots and engine pre-allocation strategy (llama.cpp / Ollama / MLX = 100% reservation; vLLM / SGLang / TGI PagedAttention ≈ 25%; TensorRT-LLM ≈ 30%; or a custom %)

## KV Cache Formulas


| Formula            | Architecture                      | Equation                                                         |
| ------------------ | --------------------------------- | ---------------------------------------------------------------- |
| **Standard**       | Most LLMs (Llama, Qwen, Mistral…) | `2 × L × H_kv × d_head × T × bytes`                              |
| **Sliding Window** | Gemma 2/3, Mistral Sliding        | local layers use `min(T, sw)` tokens; global layers use full `T` |
| **MLA**            | DeepSeek V3 / R1                  | `L × (rank + rope_dim) × T × bytes` — joint K+V latent           |
| **Linear + Full**  | Qwen 3.5                          | only sparse full-attention layers have a growing KV cache        |


> The key insight: modern models use **GQA** — always use `num_key_value_heads` (not `num_attention_heads`) in the formula. It's typically 4–8× smaller.

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
| Build tool          | Vite 8                     |
| Styling             | Tailwind CSS 4             |
| Headless components | Base UI (`@base-ui/react`) |
| Charts              | Recharts                   |
| Language            | TypeScript 6               |


## Development

```bash
npm run dev                # start dev server
npm run build              # type-check + production build
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

The site is deployed to GitHub Pages on every push to `main` via `.github/workflows/deploy.yml`.

- Project Pages URL: `https://smelukov.github.io/WeightRoom/`
- Vite reads `process.env.VITE_BASE` at build time. The workflow sets `VITE_BASE=/WeightRoom/` so all asset URLs get the subpath prefix; locally `npm run build` defaults to `/`.
- To switch to a custom apex domain (e.g. `weightroom.dev`): drop the `VITE_BASE` env from the workflow, add a `public/CNAME` file with the domain, and configure the DNS `CNAME` record. No source changes needed.
- First-time setup (only once per repo): GitHub → Settings → Pages → Source: **GitHub Actions**.

## Project Structure

```
src/
  test-setup.ts            # registers @testing-library/jest-dom matchers
  lib/
    calculator.ts          # pure math: calcLLMRam, calcDisk, calcValueScore
    scoring.ts             # UI scoring utils: normalizeScores, getValueColor, getTpsLabel
    models.ts              # static model catalog (KNOWN_MODELS, getModelGroups)
    quants.ts              # quantization constants: QUANT_BITS, WEIGHT_QUANTS, KV_QUANTS
    calcInput.ts           # resolveModel + input assembly for calc hooks
    enginePresets.ts       # inference-engine presets + resolveActiveEngine (single source of truth)
    hf.ts                  # HuggingFace config.json fetching + formula + activeParams detection
    state.ts               # URL state serialization: encodeState / decodeState
    screenshot.ts          # PNG export via html-to-image
    types.ts               # shared TypeScript types
    __tests__/
      calculator.test.ts   # all 4 KV formulas + parity invariant + MoE
      calcInput.test.ts    # input assembly + parity invariant
      state.test.ts        # round-trips, Unicode, malformed input, golden URLs
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
    Header.tsx               # app title, mode toggle, share/screenshot buttons
    Footer.tsx               # expandable "How calculations work" panel
    comparison/
      ModelsChart.tsx        # Memory/Speed bar chart
      HostingDetailsView.tsx # per-provider bar charts + fit status
      HostingScatterView.tsx # scatter plot (price vs TPS)
      utils.ts               # shared chart helpers and constants
    __tests__/
      ConcurrentUsersInput.test.tsx # presets, custom mode, dropdown UX, resolveActiveEngine
e2e/
  single.spec.ts
  compare.spec.ts
  share.spec.ts
  hf-import.spec.ts
.github/workflows/
  ci.yml                 # CыI jobs: lint, typecheck, unit (with coverage), build, e2e
.husky/
  pre-commit             # lint-staged + tsc -b + unit tests
```

## Testing

Tests are a first-class citizen — every PR is gated by CI (`lint`, `typecheck`, `unit + coverage`, `build`, `e2e`).

**Unit tests** (200+ across `src/{lib,hooks,components}/__tests__/`) cover:

- `**lib/calculator`** — all 4 KV formulas with exact numeric assertions + cross-formula matrix; `calcLLMRam` ↔ `calcValueScore` **parity** (both switch statements must agree on KV-cache size); `calcValueScore` TPS path with MoE `activeParams`, MLA arch-data path, price sensitivity; `getRamStatus` / `getDiskStatus` / `getRecommendedInstance` (incl. zero-available-resources guards)
- `**lib/calcInput`** — `resolveModel` priority (custom > known > null), `getCalcOptions` / `getValueScoreInput` 1:1 forwarding, AGENTS.md parity invariant for input builders
- `**lib/state**` — `encodeState` / `decodeState` round-trips, Unicode, malformed input, **golden-URL** backward-compat
- `**lib/hf`** — `fetchHfConfig` with mocked `fetch`: formula detection, precision detection, MoE `activeParams` estimation, warnings, errors
- `**hooks/useCalcResult**`, `**useValueScore**` — byte-for-byte match with the underlying calc functions, memoization stability, recomputation on input changes
- `**hooks/useHfModelImport**` — race conditions (stale responses discarded), unmount safety, **StrictMode regression** (`mountedRef` re-init on remount)
- `**components/ConcurrentUsersInput`** — preset matching, custom mode, dropdown UX (real `user-event` clicks), `resolveActiveEngine` truth table incl. backward-compat for legacy URLs without `engineId`

**E2E tests** (`e2e/`) cover:

- Single mode: RAM values, quant change, context change, model change
- Compare mode: chart visibility, card isolation, card limit
- URL sharing: state persistence across tabs
- HF import: network mocking, BF16 detection, error messages

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. The short version:

1. Fork → branch → make changes → `npm run lint && npm test` → PR
2. Adding a model? Edit `KNOWN_MODELS` in `src/lib/models.ts` — that's it
3. Changing a formula? Read the [Key Invariants](CONTRIBUTING.md#key-invariants) first

## License

MIT
