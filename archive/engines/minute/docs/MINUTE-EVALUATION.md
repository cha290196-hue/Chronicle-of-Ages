# Minute-engine evaluation — 2026-11-08

## Scope

Real requests run from the cloud browser using the production `core.simulate` entry and the supplied provider account. Credentials are entered only into a password field, cleared immediately on starting, and never included in test output, source, archives or reports. Requests are serial: one world, then an independent audit of that world. Token counts come from the provider; mocked Node tests are not latency or historical-accuracy measurements.

## Architecture experiments

These failed prototypes informed the final implementation and are **not** successful full-world timings:

| Trial | Observation | Decision |
| --- | --- | --- |
| Nominal low-effort thinking | 7,600 output tokens spent entirely on reasoning; no world at 60.33 s | Disable extended thinking for the bounded path |
| Flash thinking | Hit shared 62 s deadline before a result | No thinking-mode fallback |
| Unstructured one-pass non-thinking | Complete candidate in 26.76–36.16 s, but invalid checkpoints/IDs or oversized repair | Typed regional trajectories, reserved input IDs, program-derived checkpoints |
| Pro full-world generation | Candidate took 53.60 s, leaving insufficient time for audit; canceled at 62 s | Use Flash synthesis and short Pro audit |
| Early layered candidates | About 34.64–39.02 s, but rejected for invalid IDs, background dates or unresolved coverage | Bind background to fork; collect all independent structural issues before the one audit |

The archived generator's earlier five-minute first-window failure is not a completed full-world benchmark. The earlier approximately two-hour estimate was a conditional extrapolation, not measured completion time. No speedup factor against a successful old full run can be claimed.

## Completed final runs

Final completed runs are recorded below after full-horizon generation, independent review, graph/coverage validation and import sanitization. A success is never inferred from the first response or a progress indicator.

| Input | Complete wall time | Generated events | Global milestones | Independent events | Endpoint | Import check |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Christianity never emerges | 49.44 s | 54 | 9 | 41 | 2026-01-01, 7 regions / 6 domains | Passed |
| Ming survives | 37.90 s | 33 | 5 | 24 | 2026-01-01, 7 regions / 6 domains | Passed |

The milestone column above records the selector at the time of those API runs. Final deterministic selection also counts cross-region influence transmitted through the accepted descendants of a locally originating event; replaying the **same recorded ledgers** yields 27 and 17 milestones respectively. This adds no generated events or extra model requests. These replay counts are saved separately as `finalMilestones`, and must not be confused with another API latency measurement.

The Ming case used 8,666 input and 4,855 output tokens. [Exact Ming responses](../evaluation/ming-20261108.json). The first completed case used 10,473 input tokens (2,176 cached) and 6,905 output tokens across two requests. [Exact provider responses and measurements](../evaluation/christianity-20261108.json) are saved for inspection and protocol regression replay. Timings are from the real browser run, not that replay.

The displayed independence count is graph reachability, not proof that all those events would historically be unaffected. Inspection still finds arguable institutional analogies and real-history carry-over. These are limits of the model-based macro inference; this report does not turn a successful structural check into historical ground truth.

## Validation and limits

`npm test` checks exact dates, one nonzero-year calendar, immutable premises, graph references and chronology, independent regional trajectories, period projections, endpoint settings, automatic/manual completion, rejection paths, targeted repair, budget/cancel behavior, token ceilings, provider routing, progressive exploration, storage compatibility, UI wiring and versioned Pages builds. The exact frozen old ZIP independently passes its original 171 tests.

This is macro inference by language models, not an empirically calibrated simulator of all human history. The review catches some unsupported mechanisms and contradictions, but is not independent historical truth or a measured accuracy score. The target trades fine-grained window detail and extended model reasoning for complete macro coverage and later question-driven expansion. Timing varies with provider load and response length; the default 62 s cap terminates without saving partial history.
