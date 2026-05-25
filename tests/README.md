# Tests

Lightweight test setup — keeps the shipped viewer vanilla, tests live here.

## Unit tests

Pure-JS modules tested with Node's built-in `node:test`. No dependencies needed.

```bash
node --test tests/unit/
```

## E2E tests (added in slice 4)

End-to-end browser smoke tests use `puppeteer-core` driving the system Chrome.
Install with `npm install` inside `tests/` once `package.json` exists.

```bash
cd tests && npm install
node --test e2e/
```

`tests/node_modules/` is gitignored — the shipped viewer ships no npm deps.
