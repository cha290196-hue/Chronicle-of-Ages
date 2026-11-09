# Chronicle of Ages working requirements

## Output contract

- The user requires dynamic historical scope and prose volume based on duration, historical activity, causal complexity and worldwide developments. Preserve `src/world-output-policy.mjs` independently of performance/model changes.
- Do not introduce event-count targets/ceilings, per-event word/character quotas, abbreviated output modes, or hidden prose truncation to make latency look better. New initial worlds cover all eras and seven regional trajectories, with six substantive domain accounts per region. Question-driven expansion does not substitute for required initial content.
- Technical request/storage/time capacity is distinct from desired content. A length/deadline failure must be visible; never prune the world to fit or save an incomplete result as a success.

## Models and archives

- The project's selected DeepSeek text model is `deepseek-flash`, for generation, graph correction, semantic review, audit correction and the Core. Do not add or fall back to the retired Pro preset. Migrate old saved preset names to Flash without changing credentials or image configuration.
- Historical benchmark/model usage records and the checksum-verified UCM-v2 source archive are evidence. Do not rewrite or delete them to match current routing. The old generator must remain inactive.

## Validation

- The current creation budget is 120 seconds across all stages. Preserve world content when optimizing repeated serialization or audit communication; prefer actual field/text patches over retransmitting unchanged world prose.
- Report complete observed timings, primary prose counts and regional/domain coverage. Mocked replay time is not an API measurement, and graph/unit tests are not a historical-accuracy benchmark. Report failed trials and timeouts honestly.
- Keep API credentials out of code, logs, screenshots and recorded model responses. This session's supplied credential may be tested only through the authorized cloud-browser workflow.
