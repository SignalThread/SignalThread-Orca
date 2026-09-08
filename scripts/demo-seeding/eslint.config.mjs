import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const parser = require('@typescript-eslint/parser');
export default [{
  files: ['scripts/demo-seeding/*.ts'],
  languageOptions: { parser, ecmaVersion: 'latest', sourceType: 'module' },
  rules: { 'no-unreachable': 'error', 'no-constant-condition': 'error', 'no-duplicate-case': 'error', 'no-debugger': 'error' },
}];
