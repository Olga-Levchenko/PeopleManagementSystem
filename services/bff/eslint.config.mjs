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
// Test files: disable rules that consistently produce false positives in Jest specs and e2e tests.
// `@typescript-eslint/unbound-method` fires for `expect(mock.method).toHaveBeenCalled()` even
// though Jest mock methods are plain functions and this-binding is irrelevant to them.
// `@typescript-eslint/no-unsafe-*` rules fire on axios responses (which have `any`-typed body
// and headers) and on openid-client internals where no public types are available. These are
// test-only usages -- not production code -- so the type-safety risk is acceptable here.
{
  files: ['**/__tests__/**/*.spec.ts', 'test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  rules: {
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
  },
});
