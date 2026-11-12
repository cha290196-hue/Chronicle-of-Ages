# Development

## Repository layout

| Path | Contents |
| :--- | :--- |
| `index.html`, `assets/` | Application entry, styles, icons and previews |
| `src/` | Current application, API transport, storage and compatibility readers |
| `tests/` | Current application and storage regression tests |
| `scripts/prepare-pages.mjs` | Versioned static Pages artifact preparation |
| `docs/` | Current engine and development documentation |
| `archive/engines/` | Retired engines, associated tests and historical evaluations |
| `archive/snapshots/` | Original source packages and checksum manifests |

## Run and verify

Use Node.js 20 or later for tests. The browser application itself requires no package installation or build step.

```bash
python3 -m http.server 8080
npm test
npm run test:current
npm run test:archive
```

Tests use synthetic responses or stored replay fixtures and require no service credentials. Run them from the repository root. The complete suite includes archived regressions so changes to compatibility readers cannot silently discard old worlds.

## Deployment

The Pages workflow tests the repository, then copies only `index.html`, `.nojekyll`, `src/` and `assets/` into a versioned artifact. All local module imports receive the release commit as a cache version. Archive packages, evaluation data, documentation and tests are excluded from the deployed application.

## Local data

API keys are supplied at runtime. Keep local credentials, exports, logs and personal configuration outside tracked files. The ignore rules cover common credential files and local output directories. Imported and exported world archives remain user data and are not repository fixtures.
