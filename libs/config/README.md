# libs/config

Shared lint/tsconfig/jest/prettier bases for Node services (`services/bff`,
`services/people-service`, `services/resourcing-service`, `services/work-management-service`,
`services/integration-timetracker`, `services/integration-peopleforce`, `services/frontend`) — not
used by `auth-service` (.NET).

- `eslint-node.config.mjs` / `eslint-react.config.js` — flat-config arrays a service's own
  `eslint.config.{mjs,js}` imports and spreads, then appends service-specific overrides.
- `tsconfig.node.base.json` / `tsconfig.react.base.json` — compiler-option-only bases; a service's
  `tsconfig.json` sets `"extends"` to the relevant one and keeps `outDir`/`rootDir`/`include` local.
- `jest-node.preset.cjs` — shared Jest settings for Node services; referenced via `"preset"` in a
  service's `package.json` `"jest"` block.
- `prettier.base.json` — the fields every service agrees on (`singleQuote: true`). Backend services
  reference it directly via `"prettier": "../../libs/config/prettier.base.json"` in `package.json`
  (Prettier 3's defaults already match the rest of the original backend template's `.prettierrc`).
  The frontend template diverges more (`semi: false`, `trailingComma: "es5"`, `printWidth: 100`,
  `arrowParens: "avoid"`) — `services/frontend/.prettierrc.cjs` requires this base and spreads its
  own overrides on top, since Prettier config files don't support multi-file `extends` the way
  ESLint/TypeScript configs do.

## Setup

Run `npm install` inside `libs/config/` once (and after editing its `package.json`). Node
resolves the bare-specifier imports inside `eslint-node.config.mjs`/`eslint-react.config.js`
(`@eslint/js`, `typescript-eslint`, `eslint-plugin-prettier`, etc.) starting from *that file's own
directory*, not from whichever service imports it — so those packages must live in
`libs/config/node_modules`, not just a service's. Each service still keeps its own `eslint` and
`typescript-eslint` devDependencies too, since its `eslint.config.{mjs,js}` imports `typescript-eslint`
directly and its `lint` script needs the local `eslint` CLI binary. There's no root `package.json`/
npm workspace yet — this split is the workaround; a root workspace with hoisted `node_modules`
would be the more standard fix if one gets introduced later.
