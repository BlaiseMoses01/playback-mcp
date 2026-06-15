import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // Pragmatic for this codebase: untyped IPC/protocol payloads and `catch (e: any)`.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  prettier,
);
