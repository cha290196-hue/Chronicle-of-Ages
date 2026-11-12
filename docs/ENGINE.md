# World generation and storage

## Current engine

World creation routes through `core.simulate`, `chronicle-adapter.mjs` and `prompt-world.mjs`. The Analysis Core uses `explorePromptWorld` in the same module. Each normally uses one thinking-mode model response. The model interprets incomplete premises, develops the history and chooses the amount of prose, events and world settings.

The existing world, applicable ancestors and recorded history provide context. Core questions receive the selected world's stored records and conversation. The model chooses which new settings to persist. The application assigns record IDs and maps the result to the timeline and database; it does not impose historical coverage quotas, a causal-graph tribunal or a wall-clock inference deadline.

## Transport

The official DeepSeek route uses `deepseek-flash`. Custom endpoints retain their configured model. Text and image connections are independent. Requests go directly from the browser to the configured endpoint, which must support CORS.

Creation requests use OpenAI-compatible server-sent events when available. The existing progress bar responds to received content or reasoning chunks without displaying private reasoning or inventing a completion percentage. Waiting does not advance it. A completed, usable world fills the bar. Explicitly unsupported streaming options can fall back to a compatible request; JSON-only endpoints remain usable.

Cancellation uses the caller's abort signal. Truncated, interrupted or invalid output is reported rather than stored as a completed world. A malformed JSON response can receive one format-recovery attempt. Provider context and output limits still apply. Usage accounting records actual requests and provider-supplied token counts, without storing prompts, replies or API keys in the usage ledger.

## Stored worlds

Version-4 records preserve complete model-authored prose, events, endpoint settings and additional fields through save, reload, import and export. Workspace restoration separately retains the selected world, viewport, drafts, panels and scroll positions in browser storage.

Versions 2 and 3 remain readable through `world-model.mjs`, `legacy-world-reader.mjs` and the legacy knowledge reader. These modules validate existing storage formats. They do not generate new worlds or impose old constraints on version-4 output.

## Historical implementations

Retired generators, prompts, audits, replay data and associated tests are under [archive/](../archive/README.md). No production module imports an archived generator. Pages artifacts contain only the application entry, runtime modules and assets.

Automated tests use synthetic provider replies and archived response replays. They verify transport, storage, routing, cancellation and interface behavior; they do not measure live-model historical quality or response times.
