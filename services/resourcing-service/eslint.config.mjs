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
});
