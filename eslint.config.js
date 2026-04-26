// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  // ─── Global ignores (replaces .eslintignore for ESLint v9) ───────────
  {
    ignores: [
      'node_modules/**',
      'uploads/**',
      'certs/**',
      'dist/**',
      '**/dist/**',
      'coverage/**',
      'docs/**',
      '**/*.min.js',
    ],
  },
  js.configs.recommended,
  // ─── JSDoc linting (documentation quality enforcement) ───────────────
  jsdoc.configs['flat/recommended'],
  {
    files: ['**/*.js'],
    plugins: { jsdoc },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // ─── JSDoc quality rules ─────────────────────────────────────────
      'jsdoc/require-jsdoc': ['warn', {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
      }],
      'jsdoc/require-description': 'warn',
      'jsdoc/require-param': 'warn',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns': 'warn',
      'jsdoc/require-returns-description': 'warn',
      'jsdoc/valid-types': 'warn',
      'jsdoc/check-param-names': 'warn',
      // ─── Error prevention ───────────────────────────────────────────
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-prototype-builtins': 'error',

      // ─── Code quality ────────────────────────────────────────────────
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'curly': ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',

      // ─── Security ────────────────────────────────────────────────────
      'no-new-func': 'error',

      // ─── Style ───────────────────────────────────────────────────────
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always'],
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 0 }],
      'comma-dangle': ['error', 'only-multiline'],
      'arrow-parens': ['error', 'always'],
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'error',
    },
  },
  {
    // Scripts / tooling don't need the no-console restriction
    files: ['scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
];
