import js from '@eslint/js';
import stylisticTs from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import { importX } from 'eslint-plugin-import-x';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';


export default defineConfig([
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    plugins: {
      js,
      // @ts-expect-error tiny type inconsistency due a version support
      'import-x': importX,
      '@stylistic/ts': stylisticTs,
      'unused-imports': unusedImports,
      '@typescript-eslint': tseslint.plugin,
    },
    extends: ['js/recommended'],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
        ...globals.vitest,
        ...globals.browser,
      },
      parser: tseslint.parser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  tseslint.configs.recommended,
  {
    settings: {
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx', '.cts', '.mts'],
      },
      'import-x/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],

      'space-before-function-paren': ['error', {
        anonymous: 'always',
        named: 'always',
        asyncArrow: 'always',
      }],
      'no-multi-spaces': 'error',
      'no-trailing-spaces': 'error',
      'space-in-parens': ['error', 'never'],
      'array-bracket-spacing': ['error', 'never'],
      'object-curly-spacing': ['error', 'always'],
      'keyword-spacing': ['error', { before: true, after: true }],
      'comma-spacing': ['error', { before: false, after: true }],
      'semi-spacing': ['error', { before: false, after: true }],
      'no-multiple-empty-lines': ['error', {
        max: 2,
        maxBOF: 0,
        maxEOF: 0,
      }],

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],
      '@typescript-eslint/explicit-member-accessibility': [
        'off', {
          accessibility: 'explicit',
        },
      ],
      '@typescript-eslint/class-name-casing': 'off',
      '@typescript-eslint/no-shadow': 'error',

      'import-x/no-duplicates': 'error',
      'import-x/newline-after-import': ['error', { count: 2 }],
      'import-x/order': [
        'error',
        {
          groups: [
            ['builtin'],
            ['external'],
            ['internal'],
            ['parent', 'sibling'],
            ['index', 'object'],
          ],
          pathGroupsExcludedImportTypes: [],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import-x/prefer-default-export': 'off',
      'import-x/named': 'off',
      'import-x/extensions': 'off',
      'import-x/no-deprecated': 'warn',

      '@stylistic/ts/indent': ['error', 2],
      '@stylistic/ts/member-delimiter-style': [
        'error',
        {
          multiline: { delimiter: 'semi', requireLast: true },
          singleline: { delimiter: 'semi', requireLast: false },
        },
      ],
      '@stylistic/ts/semi': ['error', 'always'],
      '@stylistic/ts/type-annotation-spacing': 'error',
      '@typescript-eslint/member-ordering': 'error',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-interface': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/unified-signatures': 'error',

      'no-use-before-define': 'off',
      'arrow-body-style': 'error',
      'comma-dangle': [
        'error',
        'always-multiline',
      ],
      camelcase: 'off',
      'constructor-super': 'error',
      curly: 'error',
      'dot-notation': 'off',
      'eol-last': 'error',
      eqeqeq: ['error', 'smart'],
      semi: 'off', // disable the base rule as it can report incorrect errors
      'guard-for-in': 'error',
      'id-blacklist': 'off',
      'id-match': 'off',
      'max-len': [
        'error', {
          'code': 140,
        },
      ],
      'no-bitwise': 'error',
      'no-caller': 'error',
      'no-console': [
        'error', {
          'allow': ['warn'],
        },
      ],
      'no-debugger': 'error',
      'no-empty': 'off',
      'no-eval': 'error',
      'no-fallthrough': 'error',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'no-undef-init': 'error',
      'no-underscore-dangle': 'off',
      'no-unused-expressions': 'error',
      'no-unused-labels': 'error',
      'no-unused-vars': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
      'radix': 'error',
      'spaced-comment': 'error',
      'newline-before-return': 'error',
      'indent': 'off',
    },
  },
]);
