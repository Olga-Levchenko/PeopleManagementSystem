import { defineConfig } from 'eslint/config'
import base from '../../libs/config/eslint-react.config.js'

export default defineConfig([
  ...base,
  {
    // shadcn/ui components export variants alongside the component by design
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
