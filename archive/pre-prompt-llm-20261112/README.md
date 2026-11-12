# Pre-rewrite project snapshot

The complete project immediately before the prompt-led rewrite is preserved on the Git branch `archive/pre-prompt-llm-20261112`, at commit `297283c5adbf66ad2775027e4a0da5803cdaf041`.

This retains the Minute generation, admission, causal/coverage validation and multi-stage Core implementation, together with the UI and persistence state of that version. Previous source ZIPs, checksums and historical measurements remain unchanged.

The current production entry points use `src/prompt-world.mjs`. Legacy modules remain readable and testable for compatibility, but are not a production inference fallback.
