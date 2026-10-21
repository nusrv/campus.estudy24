import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals, ...nextTs,
  { files: ["server.js", "scripts/verify-production.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  { rules: { "@next/next/no-img-element": "off", "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] } },
  globalIgnores([".next/**", "node_modules/**", ".npm-logs/**", "storage/**", "scripts/check-source.cjs", "scripts/configure-backend.cjs", "scripts/write-initial-migration.cjs"]),
]);
