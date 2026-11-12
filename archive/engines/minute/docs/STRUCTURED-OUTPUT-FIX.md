# Structured world output repair

The original screenshot showed a format failure in `minute-world`; it did not include that request's raw response. The changes below address reproducible defects and enforce the output contract at the provider boundary. They do not claim that the unavailable original payload was recovered.

## Fixed defects

- Multipart provider content was joined with invented newline characters. Splitting a valid quoted JSON string across parts therefore made it invalid. The same chunks now concatenate losslessly and parse in one request.
- Generation and audit instructions contained pseudo-JSON type templates. They now use an actual JSON Schema and a literal valid JSON example.
- Official DeepSeek world and audit calls previously requested generic JSON text without enforcing the required fields. They now force a named `strict: true` tool at the documented beta endpoint, read its arguments, and validate the tool envelope and schema before admission/graph/coverage checks. No executable function is run.
- The parser could accept an early closed object and silently discard following JSON fields or objects. Such damaged envelopes now fail rather than losing world content or audit edits.
- Provider resource interruption, cancellation and filtering were not distinguished from malformed data. These completion states now have explicit failures and cannot commit a partial result.

The Flash route, 120-second total deadline, dynamic prose/event scope, seven regions, six domains per region and existing-world storage contract remain in force. Strict schemas impose no output-count or prose-length quotas. Custom endpoints keep their own endpoint/model and bounded JSON compatibility recovery.

## Verification

- A before/after replay of identical multipart data reproduces `MODEL_JSON_INVALID / invalid_syntax` with the former parser and returns the original complete Chinese string with the repaired parser.
- All **153 Node tests** passed, covering strict transport, ignored schemas, damaged arguments, interruptions, truncation, causal/chronological validation, real provider-response replays, coverage, persistence and Pages release versioning.
- The saved Christianity generation matches the new strict schema with all **100 events and 42 regional domain accounts**. Its historical audit timeout remains recorded as a failure, not a newly successful measurement.
- Isolated Chromium UI replay of the recorded Ming response sequence completes through 2026 with **58 events, seven regions and 42 regional domain accounts**, then survives reload. Event descriptions retain **3,675 Han characters**. The verification count of **6,751 primary Han characters** includes titles, descriptions, regional/domain narratives and their uncertainty, plus global settings; it is a replay content check, not a new live benchmark.
- Both simulated provider interruption and ignored strict output leave the existing world unchanged. Desktop and 390-pixel mobile screenshots were inspected; the mobile error view has no horizontal document overflow and there are no page errors.
- An unauthenticated OPTIONS preflight to the official strict endpoint returned HTTP 200 with the site's origin, POST and authorization/content-type headers allowed. This confirms browser CORS access without using a key or generating model output.

The browser replay uses recorded model output and a synthetic credential. It does **not** measure a fresh live inference, provider reliability, latency or historical accuracy. The [browser replay report](../evaluation/format-repair/browser-replay.json) records the checks. Local screenshots are retained with the verification artifacts; API credentials and raw new private model responses are not recorded.

Provider references: [strict tool output](https://api-docs.deepseek.com/guides/tool_calls/), [completion finish reasons](https://api-docs.deepseek.com/api/create-chat-completion/).
