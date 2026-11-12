<div align="center">
  <img src="assets/app-icon.svg?v=20261112-pixel-icon" width="68" height="68" alt="Chronicle of Ages emblem" />

  # CHRONICLE OF AGES

  **UNIFIED COMPUTATION MATRIX**

  Earth history · Divergent worldlines · Causal simulation

  [Open web application](https://cha290196-hue.github.io/Chronicle-of-Ages/) · [Source code](https://github.com/cha290196-hue/Chronicle-of-Ages) · [Report an issue](https://github.com/cha290196-hue/Chronicle-of-Ages/issues)

  <a href="README.md"><b>English</b></a> &nbsp; · &nbsp; <a href="README.zh-CN.md"><b>简体中文</b></a>

  <sub>BROWSER APPLICATION</sub>
</div>

---

<div align="center">
  <img src="assets/preview-desktop.png" alt="Chronicle of Ages timeline and worldline workspace" width="100%" />
  <br />
  <sub>CHRONOLOGY / DESKTOP WORKSPACE</sub>
</div>

<details>
<summary>Mobile interface</summary>
<br />
<div align="center"><img src="assets/preview-mobile.png" alt="Mobile timeline and worldline workspace" width="300" /></div>
</details>

## Overview

Chronicle of Ages is a browser-based environment for exploring Earth's recorded chronology and computing divergent historical worldlines. The original history remains immutable. New worlds are created by introducing dated changes; their derived events, technologies, people and institutions are recorded as editable local knowledge.

The reference timeline covers approximately **3200 BCE – 1 January 2026**. Its curated milestones are navigation anchors, not an exhaustive database of all historical events.

## Workspace

| Surface | Operation |
| :--- | :--- |
| **Chronology** | Navigate a pan-and-zoom timeline with recorded events and diverging branches. |
| **Worldline computation** | Let the model interpret and complete a premise, then develop its alternate history. |
| **World database** | Inspect, search, add, edit or delete derived records, including new knowledge produced by a divergence. |
| **Computation Core** | Ask questions grounded in a selected world's event ledger and knowledge records. |
| **Visual generation** | Generate a world illustration with a configured image-generation endpoint. |
| **Local archives** | Keep multiple independent branches in the browser; import and export versioned JSON archives. |
| **Language** | Switch between English and Simplified Chinese. |

### Timeline rules

- The reference world is Earth. The model interprets the premise against that historical context.
- Missing dates, scope and background are completed by the model, with material assumptions retained in the world.
- Branch-generated entities become available within that branch and its descendants. A subsequent change can refer to this new local knowledge.
- All divergence is bounded by the recorded-history start and **1 January 2026**. Editing a branch never rewrites the original reference chronology.
- Generated consequences are model-based scenarios. Historical records and generated facts retain separate provenance.

## Computation pipeline

1. The model interprets and enriches the user premise.
2. The same response develops the history, choosing its own events, settings and amount of text.
3. The application adapts dates and records for the existing display and saves the full authored content.
4. Each Core question receives a model-authored answer and any new settings to save in that world.

There is no production admission classifier, causal-graph audit, coverage quota, checkpoint schedule, mechanical numerical gate or mandatory review loop. There is no application inference deadline. Provider context and output capacity remain finite; incomplete transport is reported rather than saved as a completed world. See the [engine specification](docs/ENGINE.md). Historical measurement documents describe the previous engines.

## Get started

This is a **static application**, without a required backend or build step.

```bash
git clone https://github.com/cha290196-hue/Chronicle-of-Ages.git
cd Chronicle-of-Ages
python3 -m http.server 8080
```

Open `http://localhost:8080`. The chronology is available immediately. To calculate new worldlines, open **Settings**, select **Text only** (or **Text + images**), and configure a text model. **Image generation is optional.**

| Field | Example |
| :--- | :--- |
| Channel | Text only / Images only / Text + images |
| Text provider | DeepSeek / OpenRouter / OpenAI / custom OpenAI-compatible API |
| DeepSeek shortcut | **DeepSeek Flash** (`deepseek-flash`) |
| DeepSeek chat endpoint | `https://api.deepseek.com/chat/completions` (filled automatically) |
| Text API key | Your own DeepSeek or other provider key |
| Image provider | OpenRouter / OpenAI / custom endpoint, configured separately |
| Image endpoint / model / key | Required **only if** image generation is enabled |

**DeepSeek setup:** Select **Text only** → **DeepSeek Flash** → enter your DeepSeek API key → **Save**. You can simulate history and ask the computation core without configuring images. Choosing **Text + images** keeps the image service independent; DeepSeek text API is not an image-generation endpoint. **Images only** saves an image connection without a text model, but creating new worldlines still requires a text model.

API requests are sent directly from the browser. The model endpoint must permit browser-origin requests (CORS). Text and image API keys are separate and are session-only by default; optional local persistence is available in Settings. For a public deployment, use a provider credential intended for client-side use or an independent authenticated proxy with appropriate limits. **No project API key is included.**

## Interaction

| Action | Control |
| :--- | :--- |
| Move through history | Drag the canvas |
| Zoom to a period | Scroll / trackpad zoom, or use ± |
| Inspect an event | Select a node |
| View the full period | Fit to timeline |
| Create a worldline | Enter a change → Simulate |
| Extend an existing world | Select a branch → enter another change |
| Ask the computation core | Open the speech-bubble icon |
| Store a backup | Export a JSON archive |
| Restore data | Import a JSON archive |

Worldlines are kept in browser-local storage. Exporting is recommended before clearing site data or moving to another browser.

## Implementation

| Area | Technology |
| :--- | :--- |
| Interface | HTML · CSS · JavaScript ES modules |
| Chronology | High-DPI Canvas 2D · pointer interaction · bounded chronology |
| Simulation | LLM chat completions · structured JSON records · checkpointed state |
| Data | Curated reference events · branch-local event and concept ledgers |
| Storage | Browser localStorage · JSON archives |
| Deployment | GitHub Pages · GitHub Actions |
| Tests | Node.js built-in test runner |

```bash
npm test
```

### References

Architecture and interface patterns were informed by the following materials; implementation code is original to this repository:

- [Generative Agents: Interactive Simulacra of Human Behavior](https://doi.org/10.1145/3586183.3606763) — memory, planning and reflection as stateful computational patterns.
- [vis-timeline](https://github.com/visjs/vis-timeline) — interactive chronological navigation and pan/zoom conventions.
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) — techniques for machine-readable model results.
- [DeepSeek API documentation](https://api-docs.deepseek.com/) — current model IDs, compatible chat completions endpoint, and JSON output.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) — static publishing workflow.

---

<div align="center"><sub>CHRONICLE OF AGES &nbsp; / &nbsp; UNIFIED COMPUTATION MATRIX</sub></div>
## Stateful simulation

The production engine is **Prompt LLM / 4**. One normal model response interprets and expands the premise, chooses the narrative volume and creates the world. The Core likewise answers and develops world settings in one response. Production no longer uses admission rules, graph audits, fixed region/domain grids, checkpoints, mechanical numerical gates or review/repair pipelines. Code adapts the result to the existing display and storage, without pruning prose or imposing an inference deadline. Provider context/output limits still apply. Old worlds and frozen source archives remain readable, with no production fallback. The pre-rewrite project is preserved on `archive/pre-prompt-llm-20261112`. [Implementation and limits](docs/ENGINE.md).
