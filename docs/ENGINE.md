# Prompt LLM / 4

The production entry is `core.simulate → chronicle-adapter.simulatePromptWorld → prompt-world.mjs`. The Analysis Core routes to `explorePromptWorld` in the same module. The pre-rewrite project is preserved at commit `297283c5adbf66ad2775027e4a0da5803cdaf041` on `archive/pre-prompt-llm-20261112`.

## Model-led generation

The model receives the user's full input, any existing clarification answers, the selected world, its ancestors and the recorded timeline when starting from reality. The creation prompt tells the model to interpret incomplete input, supply missing assumptions, choose a coherent continuation and decide its own amount of prose, events and world settings. These choices are not scored or adjudicated by code.

A normal creation uses one model response. There is no production admission classifier, prerequisite DAG, reachability classification, checkpoint coverage rule, seven-region/six-domain grid, mechanical ranking/calculation gate, independent audit or semantic repair loop. Coherence, continuity, ordinary physics and the established Earth endpoint are prompt instructions. There is no application inference deadline. The model's own thinking mode is enabled for the selected official DeepSeek Flash route; configured custom endpoints retain their model.

The Core receives the selected world, all applicable stored events/settings and the complete conversation supplied by the app. It answers and decides which new settings to save in the same response. It is not limited to a term-ranked or character-clipped subset. A model-authored hypothetical can remain nonpersistent. The app records answers and accepted storage-format records together.

## Storage and display adapter

JSON is a transport container for the existing application. Creation supplies a title, summary, fork date, prose and event/fact arrays. The adapter assigns stable record IDs and maps titles, dates and descriptions onto the existing timeline and database fields. Checks are limited to the primitive shape needed to display and store those records: they do not judge historical reasoning or demand a particular event count, coverage pattern, causal graph or output size.

Prose is not sliced or rewritten. Model-authored narratives, endpoint settings, assumptions and extra fields remain in the version-4 snapshot. The existing world-state detail view displays them without introducing controls or changing typography. UI branch inheritance copies shared pre-fork records; it does not force the model's later outcomes. Version-4 reload/export/import does not run legacy graph or regional validators. Versions 2 and 3 retain their readers and compatibility tests.

New Core records use source `prompt-llm`. Storage normalizes the required display fields and record identity, without applying the legacy dependency, arithmetic, ranking or semantic-conflict tribunal. Existing legacy records keep their legacy reader. Old engine modules remain available for archived replay tests and compatibility; production has no fallback to them.

## Provider transport and failure behavior

Official DeepSeek uses the normal chat-completions endpoint with JSON output and thinking enabled. It does not force the old named strict tool or its world/audit schemas. The provider documents thinking control, JSON mode and the current maximum output capacity of 393,216 tokens. Production supplies that capacity to the official endpoint, and 65,536 to other compatible endpoints. These are transport headroom, not requested prose lengths; completion can stop naturally far earlier. A compatible service explicitly rejecting the output-capacity parameter can use its own default after a transport retry.

There is no infinite context or output capacity. A provider reporting truncation, interruption or invalid data fails visibly; the app never trims a generated world into a success. A malformed JSON reply may receive one syntax-only retry, and unsupported JSON mode can use the existing compatible transport fallback. These are transport recovery, not a historical audit or a request for a shorter world. Cancellation uses the user's abort signal. API usage records count actual provider attempts; the world snapshot does not invent network-call counts.

Primary API references: [chat completions](https://api-docs.deepseek.com/api/create-chat-completion/), [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/), [JSON output](https://api-docs.deepseek.com/guides/json_mode/).

## Validation evidence

Automated tests use synthetic provider responses and existing archived replays. They cover single-response routing, autonomous premise completion, model-chosen output volume, long-text round trips, old-data compatibility, full question context, knowledge persistence, cancellation, truncation and existing UI behavior. They do not establish live-model historical quality, latency or API success rates. Historical benchmark documents describe their original engines and are not measurements of Prompt LLM / 4.
