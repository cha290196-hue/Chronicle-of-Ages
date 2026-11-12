# Frozen UCM-Ω v2 engine

The complete old repository is frozen at commit `f3f0266279ddec247ca09dc3bfe9b608ebbf01c7` on branch [`archive/ucm-omega-v2-20261108`](https://github.com/cha290196-hue/Chronicle-of-Ages/tree/archive/ucm-omega-v2-20261108).

[source-f3f0266.zip](source-f3f0266.zip) contains that exact commit, including all original engine modules, tests, documentation and assets. SHA-256:

```
cdac81ca795b032dc988dae224e88a69fc1707b9b8039880d6529bea5a4e199c
```

Extract the ZIP, enter `ucm-omega-v2`, and run `npm test` to reproduce its tests. This archive is for comparison and recovery; the production application never imports it and has no fallback to its generators. Existing v2 user worlds remain readable through the versioned storage adapter.

The active engine is documented in [docs/ENGINE.md](../../../docs/ENGINE.md). Historical design and benchmark documents in the ZIP describe the old engine, not the current production path.
