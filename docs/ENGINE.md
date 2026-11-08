# Chronicle Minute — production engine v3

A bounded macro-history engine replaces the archived UCM-Ω v2 generator. The new entry is `core.simulate → minute-simulation.simulateMinute`. It targets about one minute to produce a **complete** conditional Earth world through **2026-01-01**, including a causal ledger, major world events, seven regional endpoint settings and six global domains. The old generator is not imported or used as fallback. [Exact old source archive](../archive/ucm-omega-v2/README.md).

## Execution and budget

1. One complete-world request jointly interprets the input, applies the chosen completion policy and synthesizes seven autonomous regional trajectories followed by the intervention effects and their interactions. They form one shared world, not seven alternative scenarios. Rejected or unresolved inputs stop here.
2. Deterministic code compiles immutable interventions and checks the complete graph: valid years, exact explicit anchors, pre-fork ancestry, existing prerequisites, no cycles or future causes, all seven regions, six setting domains and every required period through 2026.
3. One independent short request reviews the **same** world for premise fidelity, actual causal mechanisms, global and temporal coverage, and setting consistency. It either passes, supplies explicit ID-level corrections, asks for indispensable information in manual mode, or rejects. Corrected output undergoes the same complete graph validation again.
4. Only a complete reviewed result is committed. Period summaries, snapshots and UI-compatible records are projections of that single ledger. There is no per-window model loop, duplicate independent world, unbounded repair loop, automatic restart or hidden JSON retry.

The default wall-clock budget is **62 seconds**, with an approximately 60-second target. A shared AbortController cancels model requests; an abort race also bounds adapters that ignore cancellation. Cancellation returns without storing an unfinished world. The two output ceilings are 7,600 and 2,800 tokens; ceilings are not billed usage. Model/service queuing and output throughput can prevent success within the budget. A hard stop guarantees bounded waiting, not a successful response from every model or provider.

On the official DeepSeek endpoint, the engine uses Flash for synthesis and Pro for the short independent review. This is disclosed in Settings; the Core retains the user-selected model. Other endpoints use the selected model without substitution. DeepSeek requests explicitly disable extended thinking for this path. Real testing showed that even a nominal low-effort thinking request could spend its entire 7,600-token ceiling on reasoning without emitting the world. The new engine spends the finite budget on concise causal records and an independent review. Other providers retain their configured model; an OpenAI-compatible service must honor cancellation and support JSON responses.

## Quality and resolution

This is a deliberate tradeoff from the archived fine-window approach: **global macro history first, question-driven detail later**. Long active histories should generally contain roughly 24–36 meaningful macro events distributed across the horizon. That is a writing budget, not a validation quota or permission to invent filler. A short horizon, quiet period or supported extinction can legitimately contain fewer events. A reviewer checks content; deterministic graph validity alone cannot establish historical plausibility. No claim of measured historical accuracy or equivalence to unlimited computation is made.

Every event names causes and prerequisites in one DAG spanning the imposed intervention, pre-fork background, inherited knowledge and other events. Its description explains both the mechanism and historical impact. Programmatic direct/indirect/independent labels come from reachability. Every region must supply an autonomous trajectory or an evidence-based explanation of why none exists; events in an autonomous trajectory cannot descend from the intervention. Milestones are a subset of accepted major/epochal events with multi-region impact directly or through accepted causal descendants; no second model invents a decorative list. Regional and domain settings capture quiet background without inflating the event ledger.

Content is generated once in the requested language rather than generating duplicate bilingual histories. UI language changes do not translate an existing saved world. Unknown identities, precise values and uncertain pathways remain explicit rather than masquerading as sourced facts. Model-recalled background is marked unverified, and generated outcomes remain conditional.

## Input and exact time

The reality timeline is a visual reference, not an exhaustive historical database or an input-theme script. Canvas forks at the exact integer anchor year, including years without a displayed marker. There is no year zero. The supported span is approximately 3200 BCE through 2026-01-01.

Automatic completion is on by default in the UI. It fills initial omissions conservatively and saves each material assumption. An unqualified “Christianity does not exist” ordinarily means it never arose, without gratuitously removing Jesus or unrelated Jewish movements. Completion off opens the existing clarification drawer; continuation retains the original input, selected parent and previous answers. Nonsense, negligible changes requiring magical butterflies, no defensible Earth connection and unsupported physical-law models are refused. A hypothetical initial condition does not justify arbitrary downstream causal bridges.

Child branches inherit only temporally valid ancestral records before each divergence. New children cannot cite future parent discoveries. Parallel worlds do not contaminate each other. The original timeline remains immutable.

## Progressive exploration and storage

The Analysis Core continues to infer details proportional to a question, retrieves relevant regional state and causal evidence, checks new conditional knowledge, and stores accepted discoveries in that world. A missing database row alone is not a refusal reason. Rankings or identities that cannot be uniquely derived require conditional answers rather than fabricated certainty.

Inner simulation format 3 saves the raw compact graph, review, explicit assumptions, full-horizon checkpoints, settings, actual elapsed time and per-call budgets. The existing outer export envelope remains version 2. Read-only format-2 compatibility preserves saved old worlds; importing a v3 world revalidates its graph. New worlds never invoke archived generators. Queries about earlier years use only earlier snapshots and temporally filtered records, not the 2026 endpoint setting.

## Implementation basis

The orchestration is small original JavaScript suited to a static browser application. No framework is credited with making model generation intrinsically faster.

- [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/): explicit thinking toggle; low/high/max effort is not a token/time guarantee.
- [DeepSeek chat completion API](https://api-docs.deepseek.com/api/create-chat-completion/): output ceilings, structured responses and provider usage.
- [LangGraph fault tolerance](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance): bounded steps, cancellation and avoiding uncontrolled retries, adapted without adding its runtime.
- [Pearl, Causality](https://doi.org/10.1017/CBO9780511803161): separating interventions, background and causal consequences. This project does not estimate unknown historical structural equations or calibrated counterfactual probabilities.

Run `npm test` for current contract/API/UI/storage tests. The archived source includes its own unchanged tests. Real API measurements and limits belong in [MINUTE-EVALUATION.md](MINUTE-EVALUATION.md); mocked tests are never counted as latency or historical-quality evidence.
