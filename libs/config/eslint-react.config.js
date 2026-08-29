// Shared ESLint flat config base for the React frontend.
// services/frontend/eslint.config.js spreads this array and appends overrides:
//   import base from '../../libs/config/eslint-react.config.js'
//   export default defineConfig([...base, { files: [...], rules: { ... } }])
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import { globalIgnores } from 'eslint/config'

export default [
  globalIgnores(['dist', 'node_modules', 'coverage', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettierConfig,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
]
