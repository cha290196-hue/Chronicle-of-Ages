# Chronicle of Ages working requirements

## Current inference contract

- The user's 2026-11-12 rewrite replaces rule-driven inference with prompts and the LLM's own reasoning. The model chooses premise completion, historical developments, event/fact counts and prose volume. Do not reactivate admission gates, causal-DAG checks, regional/domain grids, checkpoints, mechanical ranking/calculation gates or mandatory review/repair pipelines in production.
- Production creation and Core questioning use src/prompt-world.mjs through src/chronicle-adapter.mjs. Each normally uses one model response. Use the model's thinking mode. Ordinary incomplete input is automatically interpreted and expanded by the model.
- Keep only data-format adaptation needed by the existing timeline, storage, cancellation and API transport. Do not impose a wall-clock inference deadline, content quotas, silent truncation or full-history pruning. Service/context/output capacity remains finite; incomplete or interrupted transport must fail visibly, never masquerade as a completed world.
- The timeline remains Earth history through 2026-01-01. Continuity, ordinary physics, consistency and assumed details belong in the prompts, not a programmatic reasoning tribunal.

## Models, archives and stored data

- Keep the selected official DeepSeek text model deepseek-flash, and retain custom endpoint/model configuration. Preserve existing credentials and the independent image configuration.
- The pre-rewrite project is preserved at commit 297283c5adbf66ad2775027e4a0da5803cdaf041 on archive/pre-prompt-llm-20261112. Earlier checksum-verified source snapshots and historical measurements remain evidence; do not rewrite or delete them.
- Legacy engines and validators remain available for archived tests and old data reading, with no production fallback. Old worldlines must stay readable. New version-4 worlds preserve full model-authored text across save, reload, export and import.
- Do not add UI controls without the user's instruction. Timeline typography stays fixed: event titles 10.5px, dates/counts 9px, branch titles 10px at every zoom. Preserve node layering, the enlarged zoom range and workspace restoration.

## Validation

- Test active public routing, autonomous premise completion, variable output volume, lossless persistence, cancellation and transport failures. Preserve tests for legacy compatibility; distinguish archived engine tests from production behavior.
- Keep credentials out of source, logs, test captures and screenshots. Use synthetic/replayed provider responses for programmatic tests. Live-key testing, when separately authorized, uses the cloud-browser workflow.
- Report observed evidence honestly. A mocked provider replay or passing unit test does not establish live-model historical quality, reliability or elapsed time.
