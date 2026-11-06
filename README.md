<div align="center">
  <img src="assets/favicon.svg" width="68" height="68" alt="Chronicle of Ages emblem" />

  # CHRONICLE OF AGES

  **UNIFIED COMPUTATION MATRIX**

  Earth history · Divergent worldlines · Causal simulation

  [Open web application](https://cha290196-hue.github.io/Chronicle-of-Ages/) · [Source code](https://github.com/cha290196-hue/Chronicle-of-Ages) · [Report an issue](https://github.com/cha290196-hue/Chronicle-of-Ages/issues)

  <sub>ENGLISH / 中文 &nbsp; · &nbsp; BROWSER APPLICATION</sub>
</div>

---

## Overview

Chronicle of Ages is a browser-based environment for exploring Earth's recorded chronology and computing divergent historical worldlines. The original history remains immutable. New worlds are created by introducing dated changes; their derived events, technologies, people and institutions are recorded as editable local knowledge.

The reference timeline covers approximately **3200 BCE – 1 January 2026**. Its curated milestones are navigation anchors, not an exhaustive database of all historical events.

## Workspace

| Surface | Operation |
| :--- | :--- |
| **Chronology** | Navigate a pan-and-zoom timeline with recorded events and diverging branches. |
| **Worldline computation** | Validate an Earth-specific change, propagate consequences through chronological checkpoints, and reconcile the resulting world state. |
| **World database** | Inspect, search, add, edit or delete derived records, including new knowledge produced by a divergence. |
| **Computation Core** | Ask questions grounded in a selected world's event ledger and knowledge records. |
| **Visual generation** | Generate a world illustration with a configured image-generation endpoint. |
| **Local archives** | Keep multiple independent branches in the browser; import and export versioned JSON archives. |
| **Language** | Switch between English and Simplified Chinese. |

### Timeline rules

- The reference world is Earth. A valid edit must modify Earth history, an actual physical constant, or introduce an event **on Earth at an explicit historical date**.
- A newly invented external planet or unsupported off-world history cannot be modified as an independently established reference fact.
- Branch-generated entities become available within that branch and its descendants. A subsequent change can refer to this new local knowledge.
- All divergence is bounded by the recorded-history start and **1 January 2026**. Editing a branch never rewrites the original reference chronology.
- Generated consequences are model-based scenarios. Historical records and generated facts retain separate provenance.

## Computation pipeline

```text
EARTH REFERENCE CHRONOLOGY
             │
             ▼
    CHANGE + ANCHOR VALIDATION
             │
             ▼
      WORLD STATE SNAPSHOT
       historical records
       inherited branch data
             │
             ▼
   CAUSAL CHECKPOINT PROPAGATION
     temporal event ledger
       new entity registry
       cause relationships
             │
             ▼
      WORLD RECONCILIATION
       summary · uncertainty
             │
             ▼
     EDITABLE WORLD DATABASE
             │
             ├── Further worldline forks
             ├── Grounded questions
             └── Optional illustrations
```

The engine calculates multiple intervals from the selected point of divergence to the fixed 2026 boundary. Each checkpoint receives the original modification, the relevant reference history, inherited pre-fork records and the accumulated generated state. The next stage adds dated records and new concepts. Records are structurally checked before entering the branch ledger.

## Get started

This is a **static application**, without a required backend or build step.

```bash
git clone https://github.com/cha290196-hue/Chronicle-of-Ages.git
cd Chronicle-of-Ages
python3 -m http.server 8080
```

Open `http://localhost:8080`. The chronology is available immediately. To calculate new worldlines, open **Settings** and provide a supported text model:

| Field | Example |
| :--- | :--- |
| Provider | OpenRouter / OpenAI / custom OpenAI-compatible API |
| Chat completions URL | `https://openrouter.ai/api/v1/chat/completions` |
| Text model | A model available to your account |
| API key | Your own provider-issued key |
| Image endpoint | Optional, when the provider supports compatible image generation |
| Image model | Optional image model identifier |

API requests are sent directly from the browser. The model endpoint must permit browser-origin requests (CORS). API keys are session-only by default; optional local persistence is available in Settings. For a public deployment, use a provider credential intended for client-side use or an independent authenticated proxy with appropriate limits. **No project API key is included.**

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
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) — static publishing workflow.

---

<div align="center"><sub>CHRONICLE OF AGES &nbsp; / &nbsp; UNIFIED COMPUTATION MATRIX</sub></div>