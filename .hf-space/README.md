---
title: WeightRoom
emoji: 🧮
colorFrom: indigo
colorTo: purple
sdk: static
pinned: false
license: mit
short_description: Architecture-aware RAM / disk / TPS calculator for LLMs
---

# WeightRoom

Free, architecture-aware calculator for **RAM**, **storage** and **token throughput (TPS)** when running LLMs locally or in the cloud.

- **Source code:** https://github.com/smelukov/WeightRoom
- **Issues / feedback:** https://github.com/smelukov/WeightRoom/issues
- **License:** MIT

## What it does

Pick a model, quant, context window and hardware — get RAM, disk and TPS estimates in real time.

- 4 KV-cache formulas matching real architectures (standard GQA, sliding window, MLA, linear+full)
- MoE-aware: total params for memory, active params for throughput
- Engine-aware KV pre-allocation (llama.cpp / Ollama / MLX vs vLLM / SGLang / TGI)
- 34 pre-configured models + paste-any-Hugging-Face-URL import
- Compare mode with charts and budget filters
- All client-side React, no backend, no telemetry. State serializes to URL — every config is shareable.

## Caveat

TPS is a **roof-line estimate** (theoretical maximum). Real throughput is typically 60–90% on dense single-GPU, 40–60% on multi-GPU dense, 20–40% on multi-GPU MoE. See the in-app "How calculations work" section for the full Limitations breakdown.

Use these numbers for sizing decisions, not as a substitute for benchmarks.
