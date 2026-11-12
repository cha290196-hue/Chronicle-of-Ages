# Retired Minute engine

This directory contains the v3 generation, admission, review, repair and multi-stage Core implementation. It is retained for reproduction, comparison and recovery. The current application uses `src/prompt-world.mjs` at the repository root.

| Directory | Contents |
| :--- | :--- |
| `src/` | Retired engines, prompts, schemas and transport |
| `tests/` | Historical engine and storage regressions |
| `tests/fixtures/` | Synthetic contracts and recorded failure fixtures |
| `evaluation/` | Historical provider-response replays and screenshots |
| `docs/` | Historical specifications and evaluation notes |
| `examples/` | Explicitly configured archived engine runner |

From the repository root:

```bash
npm run test:archive
```

These tests use synthetic replies or saved response replays. No live credentials are required. Historical timing results are retained as historical evidence and do not describe the current model-led engine.

The v2/v3 save reader remains under the root `src/` directory so existing worlds can still open. It contains no model calls. No current production module imports this directory.
