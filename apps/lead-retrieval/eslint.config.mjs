import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Same rule set as apps/platform and apps/orca so every product lints alike.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "supabase/**", "load-tests/**", "playwright-report/**", "test-results/**", ".lr-test/**"]),
]);

export default eslintConfig;
