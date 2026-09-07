// @ts-check
import tseslint from 'typescript-eslint';
import base from '../../libs/config/eslint-node.config.mjs';

export default tseslint.config(...base, {
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
},
// Test files: disable rules that consistently produce false positives in Jest specs.
// `@typescript-eslint/unbound-method` fires for `expect(mock.method).toHaveBeenCalled()` even
// though Jest mock methods are plain functions and this-binding is irrelevant to them.
// `@typescript-eslint/no-unsafe-assignment` fires for `any`-typed mock-result variables in
// specs that assert against `openid-client` internals where no public types are available.
{
  files: ['**/__tests__/**/*.spec.ts', 'test/**/*.spec.ts'],
  rules: {
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
  },
});
