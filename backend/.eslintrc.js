// ESLint config for the NestJS backend (ESLint 8 + typescript-eslint 6).
// Restores `pnpm lint` — the project previously shipped without a config file.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, jest: true },
  // Don't lint build output, deps, or this config file itself.
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.js'],
  rules: {
    // Pragmatic for a prototype with Mastra/TypeORM dynamic shapes.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
};
