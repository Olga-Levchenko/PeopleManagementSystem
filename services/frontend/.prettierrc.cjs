// Extends the shared base (../../libs/config/prettier.base.json) with this service's
// overrides — Prettier config files don't support multi-file "extends" the way
// ESLint/TypeScript configs do, so this spreads the base object manually.
const base = require('../../libs/config/prettier.base.json')

module.exports = {
  ...base,
  semi: false,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 100,
  arrowParens: 'avoid',
  endOfLine: 'lf',
}
